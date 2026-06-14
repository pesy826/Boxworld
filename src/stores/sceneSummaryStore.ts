import { create } from 'zustand'
import { db } from '../db'
import type { SceneSummary } from '../types'

interface SceneSummaryStore {
  summaries: Record<string, SceneSummary>   // chatId -> SceneSummary
  loaded: boolean

  load: () => Promise<void>
  upsert: (summary: SceneSummary) => Promise<void>
  remove: (chatId: string) => Promise<void>
  get: (chatId: string) => SceneSummary | undefined
}

export const useSceneSummaryStore = create<SceneSummaryStore>((set, get) => ({
  summaries: {},
  loaded: false,

  load: async () => {
    const list = await db.sceneSummaries.toArray()
    const map: Record<string, SceneSummary> = {}
    for (const s of list) map[s.chatId] = s
    set({ summaries: map, loaded: true })
  },

  upsert: async (summary) => {
    await db.sceneSummaries.put(summary)
    set((s) => ({
      summaries: { ...s.summaries, [summary.chatId]: summary },
    }))
  },

  remove: async (chatId) => {
    await db.sceneSummaries.where('chatId').equals(chatId).delete()
    set((s) => {
      const next = { ...s.summaries }
      delete next[chatId]
      return { summaries: next }
    })
  },

  get: (chatId) => get().summaries[chatId],
}))
