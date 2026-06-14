import { create } from 'zustand'
import { db } from '../db'
import { uuid } from '../utils/id'
import { fileToCompressedDataUrl } from '../utils/image'
import type { Sticker, AvatarItem } from '../types'

// ============ 表情包 ============

interface StickerStore {
  stickers: Sticker[]
  loaded: boolean

  load: () => Promise<void>
  /** 批量导入文件（文件名去扩展名作为描述）；返回导入数量 */
  importFiles: (files: File[]) => Promise<number>
  /** 用户在聊天表情面板里上传的表情（标记 favorite=true，会同时进入 AI 可用的素材库）；返回新增数量 */
  importUserStickers: (files: File[]) => Promise<number>
  updateDesc: (id: string, desc: string) => Promise<void>
  remove: (id: string) => Promise<void>
  removeAll: () => Promise<void>
  /** 切换某表情的收藏状态（出现/移出聊天面板） */
  toggleFavorite: (id: string, favorite: boolean) => Promise<void>
  /** 把一张图片（dataURL）收藏为表情：若库里已有同图则只置 favorite，否则新建；返回该表情 */
  addImageAsFavorite: (image: string, desc: string) => Promise<Sticker>
  /** 收藏某个已存在表情（按描述查到则置 favorite=true）；查不到返回 false */
  favoriteByDesc: (desc: string) => Promise<boolean>
  /**
   * 用户发了一个素材库里没有的表情时，"偷"进素材库供 AI 复用。
   * image 可缺省（仅按 desc 占位）；已存在同 desc 则跳过。返回是否新增。
   */
  stealUserSticker: (desc: string, image?: string) => Promise<boolean>
  /** 按描述查找表情（精确 → 包含 → 被包含） */
  findByDesc: (desc: string) => Sticker | undefined
}

export const useStickerStore = create<StickerStore>((set, get) => ({
  stickers: [],
  loaded: false,

  load: async () => {
    const list = await db.stickers.orderBy('createdAt').toArray()
    set({ stickers: list, loaded: true })
  },

  importFiles: async (files) => {
    const now = Date.now()
    const added: Sticker[] = []
    const existingDescs = new Set(get().stickers.map((s) => s.desc))
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const image = await stickerFileToDataUrl(file)
        const desc = file.name.replace(/\.[^.]+$/, '').trim() || `表情${now + i}`
        if (existingDescs.has(desc)) continue // 重名跳过
        existingDescs.add(desc)
        added.push({ id: uuid(), desc, image, createdAt: now + i })
      } catch {
        // 单个文件失败跳过
      }
    }
    if (added.length > 0) {
      await db.stickers.bulkAdd(added)
      set((s) => ({ stickers: [...s.stickers, ...added] }))
    }
    return added.length
  },

  importUserStickers: async (files) => {
    const now = Date.now()
    const added: Sticker[] = []
    const existingDescs = new Set(get().stickers.map((s) => s.desc))
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const image = await stickerFileToDataUrl(file)
        let desc = file.name.replace(/\.[^.]+$/, '').trim() || `表情${now + i}`
        // 重名时自动加后缀，保证用户上传的都能进收藏面板
        let suffix = 1
        let unique = desc
        while (existingDescs.has(unique)) {
          unique = `${desc}_${suffix++}`
        }
        desc = unique
        existingDescs.add(desc)
        added.push({ id: uuid(), desc, image, favorite: true, createdAt: now + i })
      } catch {
        // 单个文件失败跳过
      }
    }
    if (added.length > 0) {
      await db.stickers.bulkAdd(added)
      set((s) => ({ stickers: [...s.stickers, ...added] }))
    }
    return added.length
  },

  updateDesc: async (id, desc) => {
    const target = get().stickers.find((s) => s.id === id)
    if (!target) return
    const next = { ...target, desc: desc.trim() }
    await db.stickers.put(next)
    set((s) => ({ stickers: s.stickers.map((x) => (x.id === id ? next : x)) }))
  },

  toggleFavorite: async (id, favorite) => {
    const target = get().stickers.find((s) => s.id === id)
    if (!target) return
    const next = { ...target, favorite }
    await db.stickers.put(next)
    set((s) => ({ stickers: s.stickers.map((x) => (x.id === id ? next : x)) }))
  },

  addImageAsFavorite: async (image, desc) => {
    // 库里已有同图：只置 favorite
    const existingByImage = get().stickers.find((s) => s.image === image)
    if (existingByImage) {
      if (!existingByImage.favorite) {
        const next = { ...existingByImage, favorite: true }
        await db.stickers.put(next)
        set((s) => ({ stickers: s.stickers.map((x) => (x.id === next.id ? next : x)) }))
        return next
      }
      return existingByImage
    }
    // 新建：desc 去重
    const existingDescs = new Set(get().stickers.map((s) => s.desc))
    let base = desc.trim() || `表情${Date.now()}`
    let unique = base
    let suffix = 1
    while (existingDescs.has(unique)) {
      unique = `${base}_${suffix++}`
    }
    const sticker: Sticker = { id: uuid(), desc: unique, image, favorite: true, createdAt: Date.now() }
    await db.stickers.add(sticker)
    set((s) => ({ stickers: [...s.stickers, sticker] }))
    return sticker
  },

  favoriteByDesc: async (desc) => {
    const target = get().findByDesc(desc)
    if (!target) return false
    if (!target.favorite) {
      const next = { ...target, favorite: true }
      await db.stickers.put(next)
      set((s) => ({ stickers: s.stickers.map((x) => (x.id === next.id ? next : x)) }))
    }
    return true
  },

  stealUserSticker: async (desc, image) => {
    const trimmed = desc.trim()
    if (!trimmed) return false
    // 已有同 desc（精确）则不重复偷
    if (get().stickers.some((s) => s.desc === trimmed)) return false
    if (!image) return false
    const sticker: Sticker = {
      id: uuid(), desc: trimmed, image, favorite: false, createdAt: Date.now(),
    }
    await db.stickers.add(sticker)
    set((s) => ({ stickers: [...s.stickers, sticker] }))
    return true
  },

  remove: async (id) => {
    await db.stickers.delete(id)
    set((s) => ({ stickers: s.stickers.filter((x) => x.id !== id) }))
  },

  removeAll: async () => {
    await db.stickers.clear()
    set({ stickers: [] })
  },

  findByDesc: (desc) => {
    const target = desc.trim()
    if (!target) return undefined
    const list = get().stickers
    // 精确匹配
    let found = list.find((s) => s.desc === target)
    if (found) return found
    // 描述包含目标 / 目标包含描述（取描述最长的，匹配更具体）
    const fuzzy = list.filter((s) => s.desc.includes(target) || target.includes(s.desc))
    if (fuzzy.length > 0) {
      return fuzzy.sort((a, b) => b.desc.length - a.desc.length)[0]
    }
    return undefined
  },
}))

/**
 * 表情文件转 dataURL：
 * - 小文件（<300KB）直接读原文件（保留 GIF 动画/PNG 透明）
 * - 大文件压缩成 JPEG（256px 足够表情显示）
 */
async function stickerFileToDataUrl(file: File): Promise<string> {
  if (file.size < 300 * 1024) {
    return readFileAsDataUrl(file)
  }
  return fileToCompressedDataUrl(file, 256, 0.85)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(file)
  })
}

// ============ 头像库 ============

interface AvatarLibStore {
  avatars: AvatarItem[]
  loaded: boolean

  load: () => Promise<void>
  /** 批量导入头像文件，统一打 tags；返回导入数量 */
  importFiles: (files: File[], tags: string[]) => Promise<number>
  updateTags: (id: string, tags: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  removeAll: () => Promise<void>
  /**
   * 取一张未使用的头像并标记 usedBy。
   * preferGroups 是**有序优先级**的标签组列表：每组内的标签需全部命中（AND），
   * 按顺序找到第一个有命中头像的组就用该子池；都没命中才全库随机。
   * 例：[['长辈','男'], ['长辈'], ['男']] —— 优先长辈男头像，降级长辈头像，再降级男头像。
   * 兼容旧用法：传 string[] 视为多个单标签组（依次降级）。
   */
  /**
   * @param preferGroups 优先级标签组
   * @param genderExclude 兜底时要排除的异性标签（如分配男角色时传 '女'）：
   *   优先级组全没命中时，从"不含该标签"的头像里随机（用上大量中性/动漫头像，但不撞异性），
   *   只有连这都没有才返回 undefined。
   */
  takeAvatar: (forCharacterId: string, preferGroups?: Array<string | string[]>, genderExclude?: string) => Promise<AvatarItem | undefined>
  /** 释放某角色占用的头像（删角色时可调） */
  releaseByCharacter: (characterId: string) => Promise<void>
}

export const useAvatarLibStore = create<AvatarLibStore>((set, get) => ({
  avatars: [],
  loaded: false,

  load: async () => {
    const list = await db.avatarLibrary.orderBy('createdAt').toArray()
    set({ avatars: list, loaded: true })
  },

  importFiles: async (files, tags) => {
    const now = Date.now()
    const added: AvatarItem[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        const image = await fileToCompressedDataUrl(files[i], 256, 0.85)
        added.push({ id: uuid(), image, tags: [...tags], createdAt: now + i })
      } catch {
        // 跳过失败文件
      }
    }
    if (added.length > 0) {
      await db.avatarLibrary.bulkAdd(added)
      set((s) => ({ avatars: [...s.avatars, ...added] }))
    }
    return added.length
  },

  updateTags: async (id, tags) => {
    const target = get().avatars.find((a) => a.id === id)
    if (!target) return
    const next = { ...target, tags: [...tags] }
    await db.avatarLibrary.put(next)
    set((s) => ({ avatars: s.avatars.map((x) => (x.id === id ? next : x)) }))
  },

  remove: async (id) => {
    await db.avatarLibrary.delete(id)
    set((s) => ({ avatars: s.avatars.filter((x) => x.id !== id) }))
  },

  removeAll: async () => {
    await db.avatarLibrary.clear()
    set({ avatars: [] })
  },

  takeAvatar: async (forCharacterId, preferGroups, genderExclude) => {
    const unused = get().avatars.filter((a) => !a.usedBy)
    if (unused.length === 0) return undefined

    let pool: AvatarItem[] | null = null
    if (preferGroups && preferGroups.length > 0) {
      // 按优先级依次尝试：组内标签全部命中（AND）的子池非空就用，否则降级到下一组
      for (const group of preferGroups) {
        const tags = Array.isArray(group) ? group : [group]
        if (tags.length === 0) continue
        const matched = unused.filter((a) => tags.every((t) => a.tags.includes(t)))
        if (matched.length > 0) {
          pool = matched
          break
        }
      }
      // 优先级组全没命中：从"不含异性标签"的头像里随机兜底
      // （这样能用上大量中性/动漫/未打性别标签的头像，又不会把男角色配到女头像）
      if (!pool) {
        const neutral = genderExclude
          ? unused.filter((a) => !a.tags.includes(genderExclude))
          : unused
        pool = neutral.length > 0 ? neutral : unused
      }
    } else {
      // 没有任何偏好（不该出现在 NPC 分配里）才全库随机
      pool = unused
    }

    const picked = pool[Math.floor(Math.random() * pool.length)]
    const next = { ...picked, usedBy: forCharacterId }
    await db.avatarLibrary.put(next)
    set((s) => ({ avatars: s.avatars.map((x) => (x.id === picked.id ? next : x)) }))
    return next
  },

  releaseByCharacter: async (characterId) => {
    const used = get().avatars.filter((a) => a.usedBy === characterId)
    for (const a of used) {
      const next = { ...a, usedBy: undefined }
      await db.avatarLibrary.put(next)
    }
    if (used.length > 0) {
      set((s) => ({
        avatars: s.avatars.map((x) => (x.usedBy === characterId ? { ...x, usedBy: undefined } : x)),
      }))
    }
  },
}))