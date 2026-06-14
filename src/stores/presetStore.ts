import { create } from 'zustand'
import { db } from '../db'
import { uuid } from '../utils/id'
import type { Preset, PromptSlot, PresetMode, UtilityType } from '../types'
import { getBuiltinPresets } from '../db/builtinPresets'

interface PresetStore {
  presets: Preset[]
  loaded: boolean

  load: () => Promise<void>
  create: (mode: PresetMode, name: string, copyFrom?: Preset, utilityType?: UtilityType) => Promise<Preset>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  updateSlots: (id: string, slots: PromptSlot[]) => Promise<void>
  updateSlot: (presetId: string, slotId: string, patch: Partial<PromptSlot>) => Promise<void>
  addSlot: (presetId: string, slot: PromptSlot) => Promise<void>
  removeSlot: (presetId: string, slotId: string) => Promise<void>
  resetBuiltins: () => Promise<void>
}

export const usePresetStore = create<PresetStore>((set, get) => ({
  presets: [],
  loaded: false,

  load: async () => {
    const list = await db.presets.toArray()
    list.sort((a, b) => {
      if (a.builtin !== b.builtin) return a.builtin ? -1 : 1
      return a.createdAt - b.createdAt
    })
    set({ presets: list, loaded: true })
  },

  create: async (mode, name, copyFrom, utilityType) => {
    const now = Date.now()
    let slots: PromptSlot[]
    if (copyFrom) {
      slots = copyFrom.slots.map((s) => ({ ...s, id: uuid() }))
    } else if (mode === 'utility') {
      slots = [{
        id: 'main',
        name: 'System Prompt',
        role: 'static',
        messageRole: 'system',
        content: '',
        enabled: true,
      }]
    } else {
      slots = []
    }
    const preset: Preset = {
      id: uuid(),
      name,
      mode,
      builtin: false,
      slots,
      utilityType: mode === 'utility' ? (utilityType || copyFrom?.utilityType) : undefined,
      createdAt: now,
      updatedAt: now,
    }
    await db.presets.add(preset)
    set((s) => ({ presets: [...s.presets, preset] }))
    return preset
  },

  rename: async (id, name) => {
    const p = get().presets.find((x) => x.id === id)
    if (!p) return
    const next = { ...p, name, updatedAt: Date.now() }
    await db.presets.put(next)
    set((s) => ({ presets: s.presets.map((x) => x.id === id ? next : x) }))
  },

  remove: async (id) => {
    const p = get().presets.find((x) => x.id === id)
    if (!p || p.builtin) return
    await db.presets.delete(id)
    set((s) => ({ presets: s.presets.filter((x) => x.id !== id) }))
  },

  updateSlots: async (id, slots) => {
    const p = get().presets.find((x) => x.id === id)
    if (!p) return
    const next = { ...p, slots, updatedAt: Date.now() }
    await db.presets.put(next)
    set((s) => ({ presets: s.presets.map((x) => x.id === id ? next : x) }))
  },

  updateSlot: async (presetId, slotId, patch) => {
    const p = get().presets.find((x) => x.id === presetId)
    if (!p) return
    const next = {
      ...p,
      slots: p.slots.map((s) => s.id === slotId ? { ...s, ...patch } : s),
      updatedAt: Date.now(),
    }
    await db.presets.put(next)
    set((s) => ({ presets: s.presets.map((x) => x.id === presetId ? next : x) }))
  },

  addSlot: async (presetId, slot) => {
    const p = get().presets.find((x) => x.id === presetId)
    if (!p) return
    const next = { ...p, slots: [...p.slots, slot], updatedAt: Date.now() }
    await db.presets.put(next)
    set((s) => ({ presets: s.presets.map((x) => x.id === presetId ? next : x) }))
  },

  removeSlot: async (presetId, slotId) => {
    const p = get().presets.find((x) => x.id === presetId)
    if (!p) return
    const next = {
      ...p,
      slots: p.slots.filter((s) => s.id !== slotId),
      updatedAt: Date.now(),
    }
    await db.presets.put(next)
    set((s) => ({ presets: s.presets.map((x) => x.id === presetId ? next : x) }))
  },

  resetBuiltins: async () => {
    const builtins = getBuiltinPresets()
    for (const p of builtins) {
      await db.presets.put(p)
    }
    await get().load()
  },
}))
