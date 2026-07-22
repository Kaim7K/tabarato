/** Runs async work with a small, predictable number of requests in flight. */
export async function mapWithConcurrency(items, worker, concurrency = 4) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const workerCount = Math.min(Math.max(1, concurrency), list.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, run));
  return results;
}
