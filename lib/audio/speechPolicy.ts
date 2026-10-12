/** Incidental encouragement is optional; effects remain responsive on every action. */
export class StageSpeechBudget {
  private count = 0;
  private lastAt = -Infinity;
  private lastText = "";
  constructor(
    readonly maxEvents = 3,
    readonly spacingMs = 20000,
  ) {}
  reset() {
    this.count = 0;
    this.lastAt = -Infinity;
    this.lastText = "";
  }
  allow(text: string, now: number): boolean {
    if (
      !text ||
      !Number.isFinite(now) ||
      this.count >= this.maxEvents ||
      now - this.lastAt < this.spacingMs ||
      text === this.lastText
    )
      return false;
    this.count++;
    this.lastAt = now;
    this.lastText = text;
    return true;
  }
}
