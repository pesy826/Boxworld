import { create } from 'zustand'
import { db } from '../db'
import { uuid } from '../utils/id'
import type { Lorebook, LorebookEntry } from '../types'

interface LorebookStore {
  lorebooks: Lorebook[]
  entriesByBook: Record<string, LorebookEntry[]>  // lorebookId -> entries
  loaded: boolean

  load: () => Promise<void>
  loadEntries: (lorebookId: string) => Promise<void>

  createLorebook: (name: string) => Promise<Lorebook>
  renameLorebook: (id: string, name: string) => Promise<void>
  deleteLorebook: (id: string) => Promise<void>

  createEntry: (lorebookId: string) => Promise<LorebookEntry>
  updateEntry: (id: string, patch: Partial<LorebookEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  reorderEntries: (lorebookId: string, orderedIds: string[]) => Promise<void>
}

export const useLorebookStore = create<LorebookStore>((set, get) => ({
  lorebooks: [],
  entriesByBook: {},
  loaded: false,

  load: async () => {
    const list = await db.lorebooks.orderBy('createdAt').reverse().toArray()
    set({ lorebooks: list, loaded: true })
  },

  loadEntries: async (lorebookId) => {
    const entries = await db.lorebookEntries
      .where('lorebookId').equals(lorebookId)
      .toArray()
    entries.sort((a, b) => a.insertionOrder - b.insertionOrder)
    set((s) => ({
      entriesByBook: { ...s.entriesByBook, [lorebookId]: entries },
    }))
  },

  createLorebook: async (name) => {
    const now = Date.now()
    const book: Lorebook = {
      id: uuid(),
      name: name || '未命名世界书',
      createdAt: now,
      updatedAt: now,
    }
    await db.lorebooks.add(book)
    set((s) => ({ lorebooks: [book, ...s.lorebooks] }))
    return book
  },

  renameLorebook: async (id, name) => {
    const book = get().lorebooks.find((b) => b.id === id)
    if (!book) return
    const updated = { ...book, name, updatedAt: Date.now() }
    await db.lorebooks.put(updated)
    set((s) => ({
      lorebooks: s.lorebooks.map((b) => (b.id === id ? updated : b)),
    }))
  },

  deleteLorebook: async (id) => {
    await db.transaction('rw', db.lorebooks, db.lorebookEntries, db.characters, async () => {
      await db.lorebooks.delete(id)
      await db.lorebookEntries.where('lorebookId').equals(id).delete()
      // 解绑角色
      const chars = await db.characters.where('lorebookId').equals(id).toArray()
      for (const c of chars) {
        await db.characters.put({ ...c, lorebookId: undefined })
      }
    })
    set((s) => {
      const next = { ...s.entriesByBook }
      delete next[id]
      return {
        lorebooks: s.lorebooks.filter((b) => b.id !== id),
        entriesByBook: next,
      }
    })
  },

  createEntry: async (lorebookId) => {
    const existing = get().entriesByBook[lorebookId] || []
    const maxOrder = existing.reduce((m, e) => Math.max(m, e.insertionOrder), -1)
    const entry: LorebookEntry = {
      id: uuid(),
      lorebookId,
      name: '新条目',
      keys: [],
      content: '',
      enabled: true,
      constant: false,
      position: 'before_char',
      role: 'system',
      depth: 0,
      insertionOrder: maxOrder + 1,
      caseSensitive: false,
    }
    await db.lorebookEntries.add(entry)
    set((s) => ({
      entriesByBook: {
        ...s.entriesByBook,
        [lorebookId]: [...(s.entriesByBook[lorebookId] || []), entry],
      },
    }))
    return entry
  },

  updateEntry: async (id, patch) => {
    const all = get().entriesByBook
    let bookId = ''
    let target: LorebookEntry | undefined
    for (const bid of Object.keys(all)) {
      const found = all[bid].find((e) => e.id === id)
      if (found) { bookId = bid; target = found; break }
    }
    if (!target) return
    const updated = { ...target, ...patch }
    await db.lorebookEntries.put(updated)
    set((s) => ({
      entriesByBook: {
        ...s.entriesByBook,
        [bookId]: s.entriesByBook[bookId].map((e) => (e.id === id ? updated : e)),
      },
    }))
  },

  deleteEntry: async (id) => {
    const all = get().entriesByBook
    let bookId = ''
    for (const bid of Object.keys(all)) {
      if (all[bid].some((e) => e.id === id)) { bookId = bid; break }
    }
    if (!bookId) return
    await db.lorebookEntries.delete(id)
    set((s) => ({
      entriesByBook: {
        ...s.entriesByBook,
        [bookId]: s.entriesByBook[bookId].filter((e) => e.id !== id),
      },
    }))
  },

  reorderEntries: async (lorebookId, orderedIds) => {
    const existing = get().entriesByBook[lorebookId] || []
    const byId = new Map(existing.map((e) => [e.id, e]))
    const reordered: LorebookEntry[] = []
    orderedIds.forEach((id, index) => {
      const e = byId.get(id)
      if (e) reordered.push({ ...e, insertionOrder: index })
    })
    await db.lorebookEntries.bulkPut(reordered)
    set((s) => ({
      entriesByBook: { ...s.entriesByBook, [lorebookId]: reordered },
    }))
  },
}))
