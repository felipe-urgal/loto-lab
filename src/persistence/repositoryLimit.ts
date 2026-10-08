/** Reject invalid pagination before issuing a SQL statement. */
export function assertRepositoryLimit(limit: number, maximum: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new Error(`Repository limit must be an integer between 1 and ${maximum}`);
  }
}
