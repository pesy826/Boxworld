import { create } from 'zustand'
import { db } from '../db'
import { createDefaultComfyConfig, createDefaultVoiceConfig, createDefaultNaiConfig } from '../db/defaults'
import { applyTheme } from '../utils/theme'
import type { Settings, ApiConfig, UserPersona, TickConfig, ApiEndpoint, UtilityType, ChatBehaviorConfig, ComfyConfig, NaiConfig, ImageBackend, GroupChatMode, VoiceConfig } from '../types'

interface SettingsStore {
  settings: Settings | null
  loaded: boolean

  load: () => Promise<void>
  updateApiConfig: (patch: Partial<ApiConfig>) => Promise<void>
  updateApiEndpoint: (which: 'primary' | 'utility', patch: Partial<ApiEndpoint>) => Promise<void>
  updateUserPersona: (patch: Partial<UserPersona>) => Promise<void>
  updateTickConfig: (patch: Partial<TickConfig>) => Promise<void>
  updateChatBehavior: (patch: Partial<ChatBehaviorConfig>) => Promise<void>
  updateComfyConfig: (patch: Partial<ComfyConfig>) => Promise<void>
  updateNaiConfig: (patch: Partial<NaiConfig>) => Promise<void>
  updateVoiceConfig: (patch: Partial<VoiceConfig>) => Promise<void>
  setImageBackend: (backend: ImageBackend) => Promise<void>
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>
  setGroupChatMode: (mode: GroupChatMode) => Promise<void>
  setGroupFineMaxRounds: (rounds: number) => Promise<void>
  setGroupMemberPrivateChatRecent: (count: number) => Promise<void>
  setActiveUtilityPreset: (type: UtilityType, presetId: string) => Promise<void>
  /** 设置全局默认的微信/场景预设（角色未单独指定时用这个） */
  setDefaultPreset: (mode: 'im' | 'scene', presetId: string) => Promise<void>
  setActiveSoloCharacter: (characterId: string | undefined) => Promise<void>

  getUtilityEndpoint: () => ApiEndpoint | null
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  loaded: false,

  load: async () => {
    const s = await db.settings.get('singleton')
    if (!s) throw new Error('settings 未初始化')
    set({ settings: s, loaded: true })
  },

  updateApiConfig: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, apiConfig: { ...cur.apiConfig, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateApiEndpoint: async (which, patch) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = {
      ...cur,
      apiConfig: { ...cur.apiConfig, [which]: { ...cur.apiConfig[which], ...patch } },
    }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateUserPersona: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, userPersona: { ...cur.userPersona, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateTickConfig: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, tickConfig: { ...cur.tickConfig, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateChatBehavior: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, chatBehavior: { ...cur.chatBehavior, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateComfyConfig: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const base = cur.comfyConfig || createDefaultComfyConfig()
    const next: Settings = { ...cur, comfyConfig: { ...base, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateNaiConfig: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const base = cur.naiConfig || createDefaultNaiConfig()
    const next: Settings = { ...cur, naiConfig: { ...base, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  updateVoiceConfig: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const base = cur.voiceConfig || createDefaultVoiceConfig()
    const next: Settings = { ...cur, voiceConfig: { ...base, ...patch } }
    await db.settings.put(next)
    set({ settings: next })
  },

  setImageBackend: async (backend) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, imageBackend: backend }
    await db.settings.put(next)
    set({ settings: next })
  },

  setTheme: async (theme) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, theme }
    await db.settings.put(next)
    set({ settings: next })
    applyTheme(theme)
  },

  setGroupChatMode: async (mode) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, groupChatMode: mode }
    await db.settings.put(next)
    set({ settings: next })
  },

  setGroupFineMaxRounds: async (rounds) => {
    const cur = get().settings
    if (!cur) return
    const clamped = Math.max(1, Math.min(30, Math.round(rounds) || 6))
    const next: Settings = { ...cur, groupFineMaxRounds: clamped }
    await db.settings.put(next)
    set({ settings: next })
  },

  setGroupMemberPrivateChatRecent: async (count) => {
    const cur = get().settings
    if (!cur) return
    // 0 = 全部；负数归零；上限 200 防极端
    const clamped = Math.max(0, Math.min(200, Math.round(count) || 0))
    const next: Settings = { ...cur, groupMemberPrivateChatRecent: clamped }
    await db.settings.put(next)
    set({ settings: next })
  },

  setActiveUtilityPreset: async (type, presetId) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = {
      ...cur,
      utilityPresetMap: { ...cur.utilityPresetMap, [type]: presetId },
    }
    await db.settings.put(next)
    set({ settings: next })
  },

  setDefaultPreset: async (mode, presetId) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = mode === 'im'
      ? { ...cur, defaultImPresetId: presetId }
      : { ...cur, defaultScenePresetId: presetId }
    await db.settings.put(next)
    set({ settings: next })
  },

  setActiveSoloCharacter: async (characterId) => {
    const cur = get().settings
    if (!cur) return
    const next: Settings = { ...cur, activeSoloCharacterId: characterId }
    await db.settings.put(next)
    set({ settings: next })
  },

  getUtilityEndpoint: () => {
    const s = get().settings
    if (!s) return null
    const u = s.apiConfig.utility
    if (u.apiKey && u.baseUrl && u.model) return u
    const p = s.apiConfig.primary
    if (p.apiKey && p.baseUrl && p.model) return p
    return null
  },
}))
