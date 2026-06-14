import { db } from '../db'
import { uuid } from '../utils/id'
import { useStickerStore, useAvatarLibStore } from '../stores/assetStore'
import type { Sticker, AvatarItem } from '../types'

/**
 * 内置素材包自动导入。
 * 素材放在 public/builtin-assets/ 下，由 scripts/build-asset-manifest.mjs 扫描生成 manifest.json。
 * 启动时按 manifest 版本号一次性导入（用 localStorage 记录已导入版本，避免重复）。
 */

interface AssetManifest {
  version: number
  stickers: Array<{ file: string; desc: string }>
  avatars: Array<{ file: string; tags: string[] }>
}

const IMPORTED_VERSION_KEY = 'boxworld_builtin_assets_version'

export async function importBuiltinAssetsIfNeeded(): Promise<void> {
  try {
    const res = await fetch('./builtin-assets/manifest.json')
    if (!res.ok) return // 没有内置素材包，跳过
    const manifest: AssetManifest = await res.json()
    if (!manifest || typeof manifest.version !== 'number') return

    const imported = Number(localStorage.getItem(IMPORTED_VERSION_KEY) || '0')
    if (imported >= manifest.version) return // 已导入过该版本

    console.log(`[boxworld] 开始导入内置素材包 v${manifest.version}...`)

    // ===== 表情包 =====
    const existingDescs = new Set(useStickerStore.getState().stickers.map((s) => s.desc))
    const newStickers: Sticker[] = []
    let i = 0
    for (const item of manifest.stickers || []) {
      if (existingDescs.has(item.desc)) continue
      const dataUrl = await fetchAsDataUrl(`./builtin-assets/stickers/${encodeURIComponent(item.file)}`)
      if (!dataUrl) continue
      existingDescs.add(item.desc)
      newStickers.push({
        id: uuid(), desc: item.desc, image: dataUrl, createdAt: Date.now() + i++,
      })
    }
    if (newStickers.length > 0) {
      await db.stickers.bulkAdd(newStickers)
    }

    // ===== 头像 =====
    // 以图片内容为去重键：库里已有同图（之前导入的，可能 tags 为空）→ 更新它的 tags（修正旧的无标签头像）；
    // 没有才新增。这样重跑 manifest 给头像补上性别/长辈标签时，旧库会被就地修正，不重复、不用清库。
    const existingAvatars = useAvatarLibStore.getState().avatars
    const byImage = new Map(existingAvatars.map((a) => [a.image, a]))
    const newAvatars: AvatarItem[] = []
    let updatedTagCount = 0
    for (const item of manifest.avatars || []) {
      const dataUrl = await fetchAsDataUrl(`./builtin-assets/avatars/${encodeURIComponent(item.file)}`)
      if (!dataUrl) continue
      const tags = item.tags || []
      const existing = byImage.get(dataUrl)
      if (existing) {
        // 已有同图：标签不同则更新（主要用于把旧的空标签补成性别/长辈标签）
        const same = existing.tags.length === tags.length && existing.tags.every((t) => tags.includes(t))
        if (!same) {
          await db.avatarLibrary.put({ ...existing, tags: [...tags] })
          updatedTagCount++
        }
        continue
      }
      newAvatars.push({
        id: uuid(), image: dataUrl, tags: [...tags], createdAt: Date.now() + i++,
      })
    }
    if (newAvatars.length > 0) {
      await db.avatarLibrary.bulkAdd(newAvatars)
    }
    if (updatedTagCount > 0) {
      console.log(`[boxworld] 已修正 ${updatedTagCount} 张已有头像的标签`)
    }

    // 重新加载 store
    await useStickerStore.getState().load()
    await useAvatarLibStore.getState().load()

    localStorage.setItem(IMPORTED_VERSION_KEY, String(manifest.version))
    console.log(`[boxworld] 内置素材导入完成：表情 ${newStickers.length} 个，新增头像 ${newAvatars.length} 张`)
  } catch (e) {
    console.warn('[boxworld] 内置素材导入失败（忽略）:', e)
  }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}