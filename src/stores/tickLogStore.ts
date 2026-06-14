import { create } from 'zustand'
import { db } from '../db'
import { uuid } from '../utils/id'
import type { TickLogEntry, TickLogStage, TickLogResult } from '../types'

interface TickLogStore {
  recent: TickLogEntry[]            // 最近的日志（内存，最多 500 条）
  loaded: boolean

  load: () => Promise<void>
  log: (entry: Omit<TickLogEntry, 'id' | 'timestamp'>) => Promise<void>
  clear: () => Promise<void>
  /** 按 runId 分组取最近 N 次运行 */
  getRecentRuns: (limit?: number) => Array<{ runId: string; startedAt: number; entries: TickLogEntry[] }>
}

const MAX_KEEP = 500

export const useTickLogStore = create<TickLogStore>((set, get) => ({
  recent: [],
  loaded: false,

  load: async () => {
    const list = await db.tickLogs.orderBy('timestamp').reverse().limit(MAX_KEEP).toArray()
    list.reverse()
    set({ recent: list, loaded: true })
  },

  log: async (entry) => {
    const full: TickLogEntry = {
      ...entry,
      id: uuid(),
      timestamp: Date.now(),
    }
    await db.tickLogs.add(full)
    set((s) => {
      const next = [...s.recent, full]
      // 控制内存条数
      if (next.length > MAX_KEEP) next.splice(0, next.length - MAX_KEEP)
      return { recent: next }
    })
    // 也定期清理数据库
    if (Math.random() < 0.05) {
      const all = await db.tickLogs.orderBy('timestamp').reverse().offset(MAX_KEEP * 2).toArray()
      if (all.length > 0) {
        await db.tickLogs.bulkDelete(all.map((e) => e.id))
      }
    }
  },

  clear: async () => {
    await db.tickLogs.clear()
    set({ recent: [] })
  },

  getRecentRuns: (limit = 10) => {
    const groups = new Map<string, TickLogEntry[]>()
    for (const e of get().recent) {
      const arr = groups.get(e.runId) || []
      arr.push(e)
      groups.set(e.runId, arr)
    }
    const result = Array.from(groups.entries()).map(([runId, entries]) => ({
      runId,
      startedAt: entries[0]?.timestamp || 0,
      entries: entries.sort((a, b) => a.timestamp - b.timestamp),
    }))
    result.sort((a, b) => b.startedAt - a.startedAt)
    return result.slice(0, limit)
  },
}))
