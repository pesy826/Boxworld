import { create } from 'zustand'
import { db } from '../db'
import type { WorldSummary } from '../types'

interface WorldSummaryStore {
  summaries: Record<string, WorldSummary>   // worldId -> WorldSummary
  loaded: boolean

  load: () => Promise<void>
  upsert: (summary: WorldSummary) => Promise<void>
  get: (worldId: string) => WorldSummary | undefined
}

export const useWorldSummaryStore = create<WorldSummaryStore>((set, get) => ({
  summaries: {},
  loaded: false,

  load: async () => {
    const list = await db.worldSummaries.toArray()
    const map: Record<string, WorldSummary> = {}
    for (const s of list) map[s.worldId] = s
    set({ summaries: map, loaded: true })
  },

  upsert: async (summary) => {
    await db.worldSummaries.put(summary)
    set((s) => ({ summaries: { ...s.summaries, [summary.worldId]: summary } }))
  },

  get: (worldId) => get().summaries[worldId],
}))
