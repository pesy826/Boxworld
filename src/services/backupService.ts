import { db } from '../db'
import { uuid } from '../utils/id'
import { isTauri } from '../utils/platform'
import type {
    Character, Lorebook, LorebookEntry, Preset,
    Chat, Message, Moment, MomentComment, SceneSummary, MomentSummary, WorldSummary,
} from '../types'

const FORMAT_VERSION = 1

// ============ 导出 ============

interface ExportEnvelope {
    app: 'boxworld'
    formatVersion: number
    type: string
    exportedAt: number
    data: any
}

function envelope(type: string, data: any): ExportEnvelope {
    return { app: 'boxworld', formatVersion: FORMAT_VERSION, type, exportedAt: Date.now(), data }
}

/**
 * 保存 JSON 文件。
 * - Tauri 桌面端：弹出原生「另存为」对话框，用户选择保存位置后写入文件，返回完整路径（取消返回 null）。
 *   修复了 WebView2 里 `<a download>` blob-URL 静默失败 / 文件落到找不到的位置的问题。
 * - 浏览器/移动端：沿用 `<a download>` 兜底，文件落到浏览器下载目录，返回文件名（无法拿到真实路径）。
 */
async function saveJson(filename: string, obj: any): Promise<string | null> {
    const content = JSON.stringify(obj, null, 2)

    if (isTauri()) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        // 弹原生保存对话框，默认文件名 + JSON 过滤器
        const filePath = await save({
            defaultPath: filename,
            filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (!filePath) return null // 用户取消
        await invoke('write_text_file', { path: filePath, content })
        return filePath
    }

    // 浏览器兜底：标准下载
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return filename
}

function dateStamp(): string {
    const d = new Date()
    const p = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function safeName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

/** 导出单本世界书（含条目） */
async function collectLorebook(lorebookId: string) {
    const lorebook = await db.lorebooks.get(lorebookId)
    if (!lorebook) return null
    const entries = await db.lorebookEntries.where('lorebookId').equals(lorebookId).toArray()
    return { lorebook, entries }
}

/** 导出单个角色 - 精简包（分享用）：角色 + 绑定世界书，不含聊天/朋友圈 */
export async function exportCharacterShare(characterId: string) {
    const character = await db.characters.get(characterId)
    if (!character) throw new Error('角色不存在')

    let lorebookBundle = null
    if (character.lorebookId) {
        lorebookBundle = await collectLorebook(character.lorebookId)
    }

    const data = {
        character: stripCharacterRuntime(character),
        lorebook: lorebookBundle,
    }
    return saveJson(`boxworld-character-${safeName(character.name)}-share.json`, envelope('character_share', data))
}

/**
 * 导出整个"角色世界" - 完整包：主卡 + 该世界所有 NPC + 群聊 + 各自单聊/朋友圈 +
 * 世界书 + 统一世界记忆 + 朋友圈摘要 + 场景摘要。
 *
 * 收集范围（按"单卡世界"语义）：
 * - 角色：主 + 该世界的 NPC（isNpc && parentWorldId === 主卡 id）
 * - 聊天：主卡单聊 + 世界群聊（worldId === 主卡 id）+ NPC 单聊（characterId ∈ NPC ids）
 * - 朋友圈：作者 ∈ {主卡 + NPC} ∪ 用户在该世界发的 solo 朋友圈（soloWorldCharacterId === 主卡 id）
 * - 评论：上述朋友圈的所有评论
 * - 世界记忆：worldSummaries.worldId === 主卡 id
 * - 朋友圈摘要：ownerId ∈ {主卡 + NPC}
 * - 场景摘要：上述聊天各自的摘要
 */
export async function exportCharacterFull(characterId: string) {
    const mainChar = await db.characters.get(characterId)
    if (!mainChar) throw new Error('角色不存在')

    // 1. 角色：主卡 + 该世界 NPC
    const npcs = await db.characters
        .where('parentWorldId').equals(characterId).toArray()
    const allChars = [mainChar, ...npcs]
    const charIds = new Set(allChars.map((c) => c.id))

    // 2. 世界书（主卡绑定）
    let lorebookBundle = null
    if (mainChar.lorebookId) {
        lorebookBundle = await collectLorebook(mainChar.lorebookId)
    }

    // 3. 聊天：主卡单聊 + NPC 单聊 + 该世界群聊
    const chatMap = new Map<string, Chat>()
    // 3a. 单聊：按 characterId 遍历所有该世界角色
    for (const cid of charIds) {
        const cs = await db.chats.where('characterId').equals(cid).toArray()
        for (const c of cs) {
            // 排除可能误入的群聊（群聊 type=group，characterId 为空）
            if (c.type === 'group') continue
            chatMap.set(c.id, c)
        }
    }
    // 3b. 世界群聊
    const groupChats = await db.chats.where('worldId').equals(characterId).toArray()
    for (const c of groupChats) {
        chatMap.set(c.id, c)
    }
    const chats = Array.from(chatMap.values())
    const chatIds = chats.map((c) => c.id)

    // 4. 消息 + 场景摘要
    let messages: Message[] = []
    let sceneSummaries: SceneSummary[] = []
    for (const cid of chatIds) {
        messages = messages.concat(await db.messages.where('chatId').equals(cid).toArray())
        const ss = await db.sceneSummaries.where('chatId').equals(cid).first()
        if (ss) sceneSummaries.push(ss)
    }

    // 5. 朋友圈：作者 ∈ {主卡+NPC} ∪ 该世界 solo 朋友圈
    const momentMap = new Map<string, Moment>()
    for (const cid of charIds) {
        const ms = await db.moments.where('authorId').equals(cid).toArray()
        for (const m of ms) momentMap.set(m.id, m)
    }
    const soloMoments = await db.moments
        .where('soloWorldCharacterId').equals(characterId).toArray()
    for (const m of soloMoments) momentMap.set(m.id, m)
    const moments = Array.from(momentMap.values())
    const momentIds = moments.map((m) => m.id)

    // 6. 评论
    let comments: MomentComment[] = []
    for (const mid of momentIds) {
        comments = comments.concat(await db.momentComments.where('momentId').equals(mid).toArray())
    }

    // 7. 世界记忆（每个世界一份，id = 主卡 id）
    const worldSummary = await db.worldSummaries.where('worldId').equals(characterId).first() || null

    // 8. 朋友圈摘要（各角色自己的）
    let momentSummaries: MomentSummary[] = []
    for (const cid of charIds) {
        momentSummaries = momentSummaries.concat(
            await db.momentSummaries.where('ownerId').equals(cid).toArray(),
        )
    }

    const data = {
        // 主卡单独放（兼容旧导入），NPC 放 npcs 字段
        character: stripCharacterRuntime(mainChar),
        npcs: npcs.map(stripCharacterRuntime),
        lorebook: lorebookBundle,
        chats,
        messages,
        sceneSummaries,
        moments,
        comments,
        worldSummary,
        momentSummaries,
    }
    return saveJson(
        `boxworld-character-${safeName(mainChar.name)}-${dateStamp()}.json`,
        envelope('character_full', data),
    )
}

/** 导出单本世界书 */
export async function exportLorebook(lorebookId: string) {
    const bundle = await collectLorebook(lorebookId)
    if (!bundle) throw new Error('世界书不存在')
    return saveJson(`boxworld-lorebook-${safeName(bundle.lorebook.name)}.json`, envelope('lorebook', bundle))
}

/** 导出单个预设 */
export async function exportPreset(presetId: string) {
    const preset = await db.presets.get(presetId)
    if (!preset) throw new Error('预设不存在')
    return saveJson(`boxworld-preset-${safeName(preset.name)}.json`, envelope('preset', { preset }))
}

/** 完整备份 */
export async function exportFullBackup(includeApiKeys: boolean) {
    const settings = await db.settings.get('singleton')
    let exportSettings = settings ? JSON.parse(JSON.stringify(settings)) : null
    if (exportSettings && !includeApiKeys) {
        // 抹掉 API 敏感信息
        if (exportSettings.apiConfig) {
            exportSettings.apiConfig.primary = { baseUrl: '', apiKey: '', model: '' }
            exportSettings.apiConfig.utility = { baseUrl: '', apiKey: '', model: '' }
        }
    }

    const data = {
        characters: await db.characters.toArray(),
        chats: await db.chats.toArray(),
        messages: await db.messages.toArray(),
        moments: await db.moments.toArray(),
        momentComments: await db.momentComments.toArray(),
        events: await db.events.toArray(),
        memories: await db.memories.toArray(),
        momentSummaries: await db.momentSummaries.toArray(),
        sceneSummaries: await db.sceneSummaries.toArray(),
        lorebooks: await db.lorebooks.toArray(),
        lorebookEntries: await db.lorebookEntries.toArray(),
        presets: await db.presets.toArray(),
        settings: exportSettings,
    }
    return saveJson(`boxworld-backup-${dateStamp()}.json`, envelope('full_backup', data))
}

/** 去掉角色的运行时状态（导出时重置） */
function stripCharacterRuntime(c: Character): Character {
    return { ...c, lastTickAt: 0 }
}

// ============ 导入 ============

export interface ImportResult {
    ok: boolean
    type?: string
    message: string
}

/** 解析文件并根据 type 分发导入 */
export async function importFromFile(file: File): Promise<ImportResult> {
    let parsed: ExportEnvelope
    try {
        const text = await file.text()
        parsed = JSON.parse(text)
    } catch {
        return { ok: false, message: '文件不是合法的 JSON' }
    }

    if (parsed.app !== 'boxworld') {
        return { ok: false, message: '不是盒世界的导出文件' }
    }

    switch (parsed.type) {
        case 'character_share': return importCharacterShare(parsed.data)
        case 'character_full': return importCharacterFull(parsed.data)
        case 'lorebook': return importLorebook(parsed.data)
        case 'preset': return importPreset(parsed.data)
        case 'full_backup': return { ok: false, type: 'full_backup', message: '完整备份需要单独确认（会覆盖现有数据）' }
        default: return { ok: false, message: `未知类型：${parsed.type}` }
    }
}

/** 检查文件是不是完整备份（用于 UI 弹确认） */
export async function peekFileType(file: File): Promise<string | null> {
    try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        if (parsed.app !== 'boxworld') return null
        return parsed.type
    } catch {
        return null
    }
}

/** 导入世界书（返回新 lorebookId） */
async function importLorebookBundle(bundle: { lorebook: Lorebook; entries: LorebookEntry[] } | null): Promise<string | undefined> {
    if (!bundle) return undefined
    const newBookId = uuid()
    const now = Date.now()
    await db.lorebooks.add({
        ...bundle.lorebook,
        id: newBookId,
        name: bundle.lorebook.name,
        createdAt: now,
        updatedAt: now,
    })
    for (const e of bundle.entries) {
        await db.lorebookEntries.add({ ...e, id: uuid(), lorebookId: newBookId })
    }
    return newBookId
}

async function importCharacterShare(data: any): Promise<ImportResult> {
    const c: Character = data.character
    if (!c) return { ok: false, message: '数据缺少角色信息' }

    const newLorebookId = await importLorebookBundle(data.lorebook)

    const now = Date.now()
    const newChar: Character = {
        ...c,
        id: uuid(),
        name: c.name,
        lorebookId: newLorebookId,
        muted: c.muted ?? false,
        lastTickAt: 0,
        createdAt: now,
        updatedAt: now,
    }
    await db.characters.add(newChar)
    return { ok: true, type: 'character_share', message: `已导入角色「${newChar.name}」（精简包）` }
}

/**
 * 导入"角色世界"完整包。
 *
 * 兼容老格式（无 npcs/worldSummary/momentSummaries 字段）——新字段一律用 `|| [] / null` 兜底。
 *
 * 重映射策略：所有角色 id（主卡 + NPC）整体换新，然后 chat/moment/comment/worldSummary/
 * momentSummary/memberIds/groupIds/senderId/soloWorldCharacterId/scannedSeq 等引用全部跟着映射。
 * 'user' 作为作者/群 ID key 时保留不变（全局用户，无 id 可换）。
 */
async function importCharacterFull(data: any): Promise<ImportResult> {
    const mainChar: Character = data.character
    if (!mainChar) return { ok: false, message: '数据缺少角色信息' }
    const oldMainId = mainChar.id

    // ---------- 1. 世界书 ----------
    const newLorebookId = await importLorebookBundle(data.lorebook)

    // ---------- 2. 角色（主卡 + NPC），建 charIdMap ----------
    const charIdMap = new Map<string, string>() // 旧角色 id → 新角色 id
    const now = Date.now()

    const newMainId = uuid()
    charIdMap.set(oldMainId, newMainId)
    await db.characters.add({
        ...mainChar,
        id: newMainId,
        lorebookId: newLorebookId,
        muted: mainChar.muted ?? false,
        lastTickAt: 0,
        createdAt: now,
        updatedAt: now,
    })

    // NPC：老格式没有 npcs 字段时为空数组
    for (const npc of (data.npcs as Character[]) || []) {
        const newNpcId = uuid()
        charIdMap.set(npc.id, newNpcId)
        await db.characters.add({
            ...npc,
            id: newNpcId,
            parentWorldId: newMainId, // 归属到新主卡
            lorebookId: npc.lorebookId === mainChar.lorebookId
                ? newLorebookId  // 跟主卡共用同一本世界书时一起换；独立的世界书（极少见）旧 id 保留作废
                : npc.lorebookId,
            muted: npc.muted ?? false,
            lastTickAt: 0,
            createdAt: now,
            updatedAt: now,
        })
    }

    /** 把引用到的旧角色 id 换成新 id；'user' 等非映射值原样返回 */
    const remapChar = (oldId: string | undefined): string | undefined => {
        if (!oldId) return oldId
        if (oldId === 'user') return 'user'
        return charIdMap.get(oldId) || oldId // 映射不到（理论上不该发生）保留原值避免丢数据
    }

    // ---------- 3. 聊天（单聊 characterId / 群聊 memberIds+worldId+groupIds） ----------
    const chatIdMap = new Map<string, string>()
    for (const chat of (data.chats as Chat[]) || []) {
        const newChatId = uuid()
        chatIdMap.set(chat.id, newChatId)

        if (chat.type === 'group') {
            // 群聊：重映射 worldId / memberIds / groupIds 的键
            const newGroupIds: Record<string, string> = {}
            for (const [k, v] of Object.entries(chat.groupIds || {})) {
                newGroupIds[remapChar(k) as string] = v
            }
            await db.chats.add({
                ...chat,
                id: newChatId,
                characterId: '', // 群聊无单聊对方
                worldId: chat.worldId ? newMainId : chat.worldId,
                memberIds: (chat.memberIds || []).map(remapChar).filter(Boolean) as string[],
                groupIds: newGroupIds,
            })
        } else {
            // 单聊：characterId 重映射
            await db.chats.add({
                ...chat,
                id: newChatId,
                characterId: remapChar(chat.characterId) || newMainId,
            })
        }
    }

    // ---------- 4. 消息（chatId / senderId） ----------
    for (const m of (data.messages as Message[]) || []) {
        const newChatId = chatIdMap.get(m.chatId)
        if (!newChatId) continue
        await db.messages.add({
            ...m,
            id: uuid(),
            chatId: newChatId,
            senderId: remapChar(m.senderId),
        })
    }

    // ---------- 5. 场景摘要（chatId） ----------
    for (const ss of (data.sceneSummaries as SceneSummary[]) || []) {
        const newChatId = chatIdMap.get(ss.chatId)
        if (!newChatId) continue
        await db.sceneSummaries.add({ ...ss, id: newChatId, chatId: newChatId })
    }

    // ---------- 6. 朋友圈（authorId / soloWorldCharacterId） ----------
    const momentIdMap = new Map<string, string>()
    for (const mo of (data.moments as Moment[]) || []) {
        const newId = uuid()
        momentIdMap.set(mo.id, newId)
        await db.moments.add({
            ...mo,
            id: newId,
            authorId: remapChar(mo.authorId) || 'user',
            soloWorldCharacterId: mo.soloWorldCharacterId ? newMainId : mo.soloWorldCharacterId,
            imageDescriptions: mo.imageDescriptions || [],
            imageAnalyzed: mo.imageAnalyzed ?? true,
        })
    }

    // ---------- 7. 评论（momentId / authorId / replyToId） ----------
    // 评论 id 也需要映射（replyToId 引用同批评论）
    const commentIdMap = new Map<string, string>()
    const pendingComments: MomentComment[] = (data.comments as MomentComment[]) || []
    // 先分配新 id 并写入，replyToId 二次修正（因为依赖同批其他评论的新 id）
    for (const cm of pendingComments) {
        const newCmId = uuid()
        commentIdMap.set(cm.id, newCmId)
        const newMomentId = momentIdMap.get(cm.momentId)
        if (!newMomentId) continue // 朋友圈不在本包里（不该发生），跳过避免悬空
        await db.momentComments.add({
            ...cm,
            id: newCmId,
            momentId: newMomentId,
            authorId: remapChar(cm.authorId) || 'user',
            replyToId: cm.replyToId, // 临时旧值，下一步修正
        })
    }
    // 修正 replyToId
    for (const cm of pendingComments) {
        if (!cm.replyToId) continue
        const newCmId = commentIdMap.get(cm.id)
        const newReplyTo = commentIdMap.get(cm.replyToId)
        if (newCmId && newReplyTo) {
            await db.momentComments.update(newCmId, { replyToId: newReplyTo })
        }
    }

    // ---------- 8. 世界记忆（id / worldId / scannedSeq 键） ----------
    if (data.worldSummary) {
        const ws: WorldSummary = data.worldSummary
        const newScannedSeq: Record<string, number> = {}
        for (const [k, v] of Object.entries(ws.scannedSeq || {})) {
            const mapped = remapChar(k)
            if (mapped) newScannedSeq[mapped] = v as number
        }
        await db.worldSummaries.add({
            ...ws,
            id: newMainId,
            worldId: newMainId,
            scannedSeq: newScannedSeq,
        })
    }

    // ---------- 9. 朋友圈摘要（ownerId） ----------
    for (const ms of (data.momentSummaries as MomentSummary[]) || []) {
        await db.momentSummaries.add({
            ...ms,
            id: uuid(),
            ownerId: remapChar(ms.ownerId) || newMainId,
        })
    }

    return { ok: true, type: 'character_full', message: `已导入角色世界「${mainChar.name}」（完整包：主卡 + ${(data.npcs as Character[])?.length || 0} 个 NPC + 聊天/朋友圈/群聊/记忆）` }
}

async function importLorebook(data: any): Promise<ImportResult> {
    if (!data.lorebook) return { ok: false, message: '数据缺少世界书' }
    const id = await importLorebookBundle(data)
    return { ok: true, type: 'lorebook', message: `已导入世界书「${data.lorebook.name}」（id: ${id?.slice(0, 6)}）` }
}

async function importPreset(data: any): Promise<ImportResult> {
    const p: Preset = data.preset
    if (!p) return { ok: false, message: '数据缺少预设' }
    const now = Date.now()
    await db.presets.add({
        ...p,
        id: uuid(),
        name: `${p.name}（导入）`,
        builtin: false,                // 导入的一律视为自定义
        slots: p.slots.map((s) => ({ ...s, id: s.id })),
        createdAt: now,
        updatedAt: now,
    })
    return { ok: true, type: 'preset', message: `已导入预设「${p.name}」` }
}

/** 完整备份导入：清空数据库后写入 */
export async function importFullBackup(file: File): Promise<ImportResult> {
    let parsed: ExportEnvelope
    try {
        parsed = JSON.parse(await file.text())
    } catch {
        return { ok: false, message: '文件解析失败' }
    }
    if (parsed.app !== 'boxworld' || parsed.type !== 'full_backup') {
        return { ok: false, message: '不是完整备份文件' }
    }

    const d = parsed.data

    await db.transaction('rw',
        [
            db.characters, db.chats, db.messages, db.moments, db.momentComments,
            db.events, db.memories, db.momentSummaries, db.sceneSummaries,
            db.lorebooks, db.lorebookEntries, db.presets, db.settings,
        ],
        async () => {
            // 清空
            await Promise.all([
                db.characters.clear(), db.chats.clear(), db.messages.clear(),
                db.moments.clear(), db.momentComments.clear(), db.events.clear(),
                db.memories.clear(), db.momentSummaries.clear(), db.sceneSummaries.clear(),
                db.lorebooks.clear(), db.lorebookEntries.clear(), db.presets.clear(),
            ])
            // 写入
            if (d.characters) await db.characters.bulkAdd(d.characters)
            if (d.chats) await db.chats.bulkAdd(d.chats)
            if (d.messages) await db.messages.bulkAdd(d.messages)
            if (d.moments) await db.moments.bulkAdd(d.moments)
            if (d.momentComments) await db.momentComments.bulkAdd(d.momentComments)
            if (d.events) await db.events.bulkAdd(d.events)
            if (d.memories) await db.memories.bulkAdd(d.memories)
            if (d.momentSummaries) await db.momentSummaries.bulkAdd(d.momentSummaries)
            if (d.sceneSummaries) await db.sceneSummaries.bulkAdd(d.sceneSummaries)
            if (d.lorebooks) await db.lorebooks.bulkAdd(d.lorebooks)
            if (d.lorebookEntries) await db.lorebookEntries.bulkAdd(d.lorebookEntries)
            if (d.presets) await db.presets.bulkAdd(d.presets)
            // settings：保留现有 API 配置如果备份里是空的
            if (d.settings) {
                const current = await db.settings.get('singleton')
                const next = { ...d.settings }
                // 如果备份里 API 是空的，沿用当前的
                if (current && (!next.apiConfig?.primary?.apiKey)) {
                    next.apiConfig = current.apiConfig
                }
                await db.settings.put(next)
            }
        },
    )

    return { ok: true, type: 'full_backup', message: '完整备份已恢复，页面将刷新' }
}
