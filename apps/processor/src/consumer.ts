import { DEAD_LETTER_STREAM, type EnrichedBatch, STREAM } from '@perfpulse/protocol';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { type Rows, toRows } from './transform.js';

export const GROUP = 'processors';

export interface ConsumerOptions {
  consumer: string;
  batchSize: number;
  blockMs: number;
  claimIdleMs: number;
  maxDeliveries: number;
}

/** Writes the rows of a set of stream messages; throwing leaves the messages pending. */
export type RowsWriter = (rows: Rows) => Promise<void>;

interface Message {
  id: string;
  batch: EnrichedBatch | null;
  raw: string;
}

type StreamEntry = [id: string, fields: string[]];

function parse([id, fields]: StreamEntry): Message {
  const raw = fields[fields.indexOf('b') + 1] ?? '';
  try {
    return { id, batch: JSON.parse(raw) as EnrichedBatch, raw };
  } catch {
    return { id, batch: null, raw };
  }
}

/**
 * Consumer of the `processors` group. Each iteration reclaims messages left by a crashed consumer,
 * reads new ones, writes them in one go and acknowledges them. When the batch write fails, messages
 * are retried one by one, so that a single poisoned message cannot block the others; after
 * `maxDeliveries` it is moved to the dead-letter stream.
 */
export class StreamConsumer {
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly write: RowsWriter,
    private readonly options: ConsumerOptions,
    private readonly logger: Logger,
  ) {}

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error;
    }
  }

  private async claim(): Promise<StreamEntry[]> {
    const { consumer, claimIdleMs, batchSize } = this.options;
    const result = (await this.redis.xautoclaim(
      STREAM,
      GROUP,
      consumer,
      claimIdleMs,
      '0-0',
      'COUNT',
      batchSize,
    )) as [string, (StreamEntry | null)[]];
    return result[1].filter((entry): entry is StreamEntry => entry !== null);
  }

  private async read(): Promise<StreamEntry[]> {
    const { consumer, batchSize, blockMs } = this.options;
    const result = (await this.redis.xreadgroup(
      'GROUP',
      GROUP,
      consumer,
      'COUNT',
      batchSize,
      'BLOCK',
      blockMs,
      'STREAMS',
      STREAM,
      '>',
    )) as [string, StreamEntry[]][] | null;
    return result?.[0]?.[1] ?? [];
  }

  /** Delivery counts of pending messages of this consumer, from XPENDING. */
  private async deliveries(ids: readonly string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    // The whole pending list of this consumer: it is short, since messages are acknowledged as
    // they are written, and stream IDs do not sort as strings ("1-10" < "1-9").
    const pending = (await this.redis.xpending(
      STREAM,
      GROUP,
      '-',
      '+',
      Math.max(1000, ids.length),
      this.options.consumer,
    )) as [string, string, number, number][];
    const wanted = new Set(ids);
    return new Map(pending.filter(([id]) => wanted.has(id)).map(([id, , , count]) => [id, count]));
  }

  private async deadLetter(message: Message, reason: string): Promise<void> {
    await this.redis
      .multi()
      .xadd(
        DEAD_LETTER_STREAM,
        'MAXLEN',
        '~',
        10_000,
        '*',
        'b',
        message.raw,
        'id',
        message.id,
        'reason',
        reason,
      )
      .xack(STREAM, GROUP, message.id)
      .exec();
    this.logger.warn({ id: message.id, reason }, 'message moved to the dead-letter stream');
  }

  private async acknowledge(messages: readonly Message[]): Promise<void> {
    if (messages.length > 0)
      await this.redis.xack(STREAM, GROUP, ...messages.map((message) => message.id));
  }

  /** One iteration; returns the number of messages acknowledged. */
  async runOnce(): Promise<number> {
    const claimed = (await this.claim()).map(parse);
    const fresh = claimed.length >= this.options.batchSize ? [] : (await this.read()).map(parse);

    const counts = await this.deliveries(claimed.map((message) => message.id));
    const messages: (Message & { batch: EnrichedBatch })[] = [];
    for (const message of [...claimed, ...fresh]) {
      const { batch } = message;
      if (batch === null) await this.deadLetter(message, 'malformed');
      else if ((counts.get(message.id) ?? 1) > this.options.maxDeliveries)
        await this.deadLetter(message, 'max deliveries');
      else messages.push({ ...message, batch });
    }
    if (messages.length === 0) return 0;

    try {
      await this.write(toRows(messages.map((message) => message.batch)));
      await this.acknowledge(messages);
      return messages.length;
    } catch (error) {
      this.logger.warn(
        { err: error, messages: messages.length },
        'batch write failed, retrying one by one',
      );
    }

    let acknowledged = 0;
    for (const message of messages) {
      try {
        await this.write(toRows([message.batch]));
        await this.acknowledge([message]);
        acknowledged += 1;
      } catch (error) {
        // Left pending: reclaimed after claimIdleMs, then dead-lettered after maxDeliveries.
        this.logger.error({ err: error, id: message.id }, 'message write failed');
      }
    }
    return acknowledged;
  }

  async run(): Promise<void> {
    this.running = true;
    while (this.shouldRun()) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error({ err: error }, 'consumer iteration failed');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /** Read through a method: `stop()` flips the flag while `run()` awaits. */
  private shouldRun(): boolean {
    return this.running;
  }

  stop(): void {
    this.running = false;
  }
}
