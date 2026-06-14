import { create } from 'zustand'
import { uuid } from '../utils/id'
import type { OpenAIMessage } from '../services/promptBuilder'

export type PromptPurpose =
  | 'im_chat'
  | 'scene_chat'
  | 'screening'
  | 'thinking'
  | 'scene_summary'
  | 'im_greeting_rewrite'
  | 'moment_generate'
  | 'comment_reply'
  | 'moment_summary'
  | 'test'

export interface PromptDebugEntry {
  id: string
  purpose: PromptPurpose
  characterName?: string
  endpoint: string             // primary / utility
  model: string
  messages: OpenAIMessage[]
  rawReply?: string
  error?: string
  durationMs?: number
  timestamp: number            // 真实时间
}

const MAX_KEEP = 50

interface PromptDebugStore {
  entries: PromptDebugEntry[]
  add: (entry: Omit<PromptDebugEntry, 'id' | 'timestamp'>) => string
  updateReply: (id: string, reply: string, durationMs: number) => void
  updateError: (id: string, error: string, durationMs: number) => void
  clear: () => void
}

export const usePromptDebugStore = create<PromptDebugStore>((set) => ({
  entries: [],

  add: (entry) => {
    const id = uuid()
    const full: PromptDebugEntry = { ...entry, id, timestamp: Date.now() }
    set((s) => {
      const next = [full, ...s.entries]
      if (next.length > MAX_KEEP) next.length = MAX_KEEP
      return { entries: next }
    })
    return id
  },

  updateReply: (id, reply, durationMs) => {
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, rawReply: reply, durationMs } : e,
      ),
    }))
  },

  updateError: (id, error, durationMs) => {
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, error, durationMs } : e,
      ),
    }))
  },

  clear: () => set({ entries: [] }),
}))
