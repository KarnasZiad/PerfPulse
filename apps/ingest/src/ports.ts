import type { EnrichedBatch } from '@perfpulse/protocol';

export interface Project {
  id: string;
  publicKey: string;
  /** Exact origins (scheme, host, port) allowed to send measures, e.g. https://shop.example.ma. */
  allowedOrigins: readonly string[];
}

/** Projects known by public key, held in memory: no database on the path of a request. */
export interface ProjectCatalog {
  find(publicKey: string): Project | undefined;
  /** True once the catalog has been loaded at least once. */
  readonly ready: boolean;
}

/** Fixed window per minute. Returns false once the key went over the limit. */
export interface RateLimiter {
  hit(key: string): Promise<boolean>;
}

export interface EventSink {
  publish(batch: EnrichedBatch): Promise<void>;
}
