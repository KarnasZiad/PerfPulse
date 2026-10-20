export const REJECTIONS = [
  'body',
  'schema',
  'project',
  'origin',
  'rate',
  'bot',
  'unavailable',
] as const;
export type Rejection = (typeof REJECTIONS)[number];

/** Counters exposed in the Prometheus text format; enough for an ingestion dashboard and alerts. */
export class Metrics {
  private accepted = 0;
  private events = 0;
  private droppedValues = 0;
  private rejected = new Map<Rejection, number>(REJECTIONS.map((reason) => [reason, 0]));

  accept(events: number, dropped: number): void {
    this.accepted += 1;
    this.events += events;
    this.droppedValues += dropped;
  }

  reject(reason: Rejection): void {
    this.rejected.set(reason, (this.rejected.get(reason) ?? 0) + 1);
  }

  render(): string {
    const lines = [
      '# HELP perfpulse_batches_accepted_total Batches written to the stream.',
      '# TYPE perfpulse_batches_accepted_total counter',
      `perfpulse_batches_accepted_total ${this.accepted}`,
      '# HELP perfpulse_events_accepted_total Events written to the stream.',
      '# TYPE perfpulse_events_accepted_total counter',
      `perfpulse_events_accepted_total ${this.events}`,
      '# HELP perfpulse_values_dropped_total Implausible values dropped from accepted batches.',
      '# TYPE perfpulse_values_dropped_total counter',
      `perfpulse_values_dropped_total ${this.droppedValues}`,
      '# HELP perfpulse_batches_rejected_total Batches refused, by reason.',
      '# TYPE perfpulse_batches_rejected_total counter',
      ...[...this.rejected].map(
        ([reason, count]) => `perfpulse_batches_rejected_total{reason="${reason}"} ${count}`,
      ),
    ];
    return `${lines.join('\n')}\n`;
  }
}
