export class WorkGate {
  private active = 0;

  constructor(private readonly maximumConcurrent: number) {
    if (!Number.isInteger(maximumConcurrent) || maximumConcurrent < 1) {
      throw new Error("maximumConcurrent must be a positive integer");
    }
  }

  acquire(): (() => void) | undefined {
    if (this.active >= this.maximumConcurrent) return undefined;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }
}

// Backtests and Strategy Lab are CPU-intensive and share the same process.
// Keeping a single active analysis prevents concurrent requests from multiplying
// memory/CPU pressure. The HTTP layer returns ANALYSIS_BUSY instead of queueing
// an unbounded number of expensive calculations.
export const expensiveAnalysisGate = new WorkGate(1);
