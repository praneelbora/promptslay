/**
 * Map over `items` with at most `limit` invocations of `fn` in flight.
 * Results keep input order. The first rejection propagates after in-flight
 * work settles (workers stop picking up new items once one has failed).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${limit}`);
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failure: { error: unknown } | undefined;

  async function worker(): Promise<void> {
    while (failure === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failure ??= { error };
        return;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  if (failure !== undefined) throw failure.error;
  return results;
}
