/**
 * 限制并发执行的工具：把一组任务按 limit 并发跑完。
 */
export async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let i = 0

  async function worker() {
    while (i < tasks.length) {
      const cur = i++
      try {
        results[cur] = await tasks[cur]()
      } catch (e) {
        // 把错误也作为结果，让外层决定如何处理
        results[cur] = e as any
      }
    }
  }

  const workers: Promise<void>[] = []
  for (let w = 0; w < Math.min(limit, tasks.length); w++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}
