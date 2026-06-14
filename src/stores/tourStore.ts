import { create } from 'zustand'

/**
 * 新手指引系统。
 * - 首次启动弹欢迎窗（可选择跳过所有教程）
 * - 每个页面的教程只在"第一次进入该页面"时触发，互不强制串联
 * - 进度存 localStorage，与业务数据库无关
 */

export interface TourStep {
  /** data-tour 锚点 key；不填 = 居中卡片（纯说明，无聚光灯） */
  target?: string
  title: string
  content: string
  /** 点击高亮元素本身也算完成该步（引导用户真实点击） */
  advanceOnClick?: boolean
}

export interface TourDef {
  id: string
  steps: TourStep[]
}

type TourPref = 'unset' | 'on' | 'off'

const PREF_KEY = 'boxworld_tour_pref'
const DONE_KEY = 'boxworld_tours_done'

function loadPref(): TourPref {
  const v = localStorage.getItem(PREF_KEY)
  return v === 'on' || v === 'off' ? v : 'unset'
}

function loadDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || '{}')
  } catch {
    return {}
  }
}

interface TourStore {
  pref: TourPref
  completed: Record<string, boolean>
  active: { def: TourDef; index: number } | null

  setPref: (p: 'on' | 'off') => void
  /** 页面挂载时调用：开启了教程 + 该教程没完成 + 当前没有教程在跑 → 启动 */
  maybeStart: (def: TourDef) => void
  next: () => void
  /** 跳过当前教程（标记完成，不再出现） */
  skipCurrent: () => void
  /** 重置全部教程（设置页用） */
  resetAll: () => void
}

export const useTourStore = create<TourStore>((set, get) => ({
  pref: loadPref(),
  completed: loadDone(),
  active: null,

  setPref: (p) => {
    localStorage.setItem(PREF_KEY, p)
    set({ pref: p })
  },

  maybeStart: (def) => {
    const { pref, completed, active } = get()
    if (pref !== 'on') return
    if (completed[def.id]) return
    if (active) return
    if (def.steps.length === 0) return
    set({ active: { def, index: 0 } })
  },

  next: () => {
    const { active } = get()
    if (!active) return
    const nextIndex = active.index + 1
    if (nextIndex >= active.def.steps.length) {
      markDone(active.def.id, set, get)
    } else {
      set({ active: { ...active, index: nextIndex } })
    }
  },

  skipCurrent: () => {
    const { active } = get()
    if (!active) return
    markDone(active.def.id, set, get)
  },

  resetAll: () => {
    localStorage.removeItem(DONE_KEY)
    localStorage.setItem(PREF_KEY, 'on')
    set({ completed: {}, pref: 'on', active: null })
  },
}))

function markDone(
  tourId: string,
  set: (partial: Partial<TourStore>) => void,
  get: () => TourStore,
) {
  const completed = { ...get().completed, [tourId]: true }
  localStorage.setItem(DONE_KEY, JSON.stringify(completed))
  set({ completed, active: null })
}

/** 是否需要展示首次启动欢迎窗 */
export function needsWelcome(): boolean {
  return loadPref() === 'unset'
}