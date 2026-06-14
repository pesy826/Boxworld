import { create } from 'zustand'
import { db } from '../db'
import type { Character } from '../types'

interface CharacterStore {
  characters: Character[]
  loaded: boolean

  load: () => Promise<void>
  add: (char: Character) => Promise<void>
  remove: (id: string) => Promise<void>
  update: (id: string, patch: Partial<Character>) => Promise<void>
  toggleMute: (id: string) => Promise<void>
  getById: (id: string) => Character | undefined

  /** 主卡（非 NPC） */
  getMainCharacters: () => Character[]
  /** 某单卡世界的 NPC */
  getNpcsOfWorld: (worldId: string) => Character[]
}

function fillDefaults(c: Character): Character {
  return {
    ...c,
    muted: c.muted ?? false,
    lastTickAt: c.lastTickAt ?? 0,
    soloModeEntered: c.soloModeEntered ?? false,
    soloVirtualTime: c.soloVirtualTime ?? 0,
    soloRealAnchor: c.soloRealAnchor ?? 0,
    isNpc: c.isNpc ?? false,
    isContact: c.isContact ?? true,
  }
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  loaded: false,

  load: async () => {
    const list = await db.characters.orderBy('createdAt').reverse().toArray()
    set({ characters: list.map(fillDefaults), loaded: true })
  },

  add: async (char) => {
    const full = fillDefaults(char)
    await db.characters.add(full)
    set((s) => ({ characters: [full, ...s.characters] }))
  },

  remove: async (id) => {
    const removedIds: string[] = [id]
    await db.transaction('rw',
      [db.characters, db.chats, db.messages, db.moments, db.momentComments, db.events, db.memories],
      async () => {
        await db.characters.delete(id)
        // 删除主卡时，连带删除它世界里的所有 NPC
        const npcs = await db.characters.where('parentWorldId').equals(id).toArray()
        for (const npc of npcs) {
          await db.characters.delete(npc.id)
          removedIds.push(npc.id)
        }
        const allIds = [id, ...npcs.map((n) => n.id)]
        for (const cid of allIds) {
          const chats = await db.chats.where('characterId').equals(cid).toArray()
          const chatIds = chats.map((c) => c.id)
          await db.chats.where('characterId').equals(cid).delete()
          for (const chid of chatIds) {
            await db.messages.where('chatId').equals(chid).delete()
          }
          await db.moments.where('authorId').equals(cid).delete()
          await db.events.where('characterId').equals(cid).delete()
          await db.memories.where('characterId').equals(cid).delete()
        }
      },
    )
    set((s) => ({ characters: s.characters.filter((c) => c.id !== id && c.parentWorldId !== id) }))
    // 释放该角色（及其世界 NPC）占用的头像库头像
    try {
      const { useAvatarLibStore } = await import('./assetStore')
      for (const rid of removedIds) {
        await useAvatarLibStore.getState().releaseByCharacter(rid)
      }
    } catch { /* 忽略 */ }
    // 若删掉的正是当前激活的单卡主卡，自动退出单卡模式，避免卡在"虚空世界"（通讯录空、看不到新卡）
    try {
      const { useSettingsStore } = await import('./settingsStore')
      const activeSoloId = useSettingsStore.getState().settings?.activeSoloCharacterId
      if (activeSoloId && activeSoloId === id) {
        await useSettingsStore.getState().setActiveSoloCharacter(undefined)
      }
    } catch { /* 忽略 */ }
  },

  update: async (id, patch) => {
    const target = get().characters.find((c) => c.id === id)
    if (!target) return
    const merged = { ...target, ...patch, updatedAt: Date.now() }
    await db.characters.put(merged)
    set((s) => ({ characters: s.characters.map((c) => (c.id === id ? merged : c)) }))
  },

  toggleMute: async (id) => {
    const target = get().characters.find((c) => c.id === id)
    if (!target) return
    const merged = { ...target, muted: !target.muted, updatedAt: Date.now() }
    await db.characters.put(merged)
    set((s) => ({ characters: s.characters.map((c) => (c.id === id ? merged : c)) }))
  },

  getById: (id) => get().characters.find((c) => c.id === id),

  getMainCharacters: () => get().characters.filter((c) => !c.isNpc),

  getNpcsOfWorld: (worldId) => get().characters.filter((c) => c.isNpc && c.parentWorldId === worldId),
}))
