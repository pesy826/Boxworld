import { db } from '../db'
import { uuid } from '../utils/id'
import type {
    Character, Lorebook, LorebookEntry, Preset,
    Chat, Message, Moment, MomentComment, SceneSummary, MomentSummary,
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

function download(filename: string, obj: any) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
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
    download(`boxworld-character-${safeName(character.name)}-share.json`, envelope('character_share', data))
}

/** 导出单个角色 - 完整包：角色 + 世界书 + 聊天 + 朋友圈 + 摘要 */
export async function exportCharacterFull(characterId: string) {
    const character = await db.characters.get(characterId)
    if (!character) throw new Error('角色不存在')

    let lorebookBundle = null
    if (character.lorebookId) {
        lorebookBundle = await collectLorebook(character.lorebookId)
    }

    const chats = await db.chats.where('characterId').equals(characterId).toArray()
    const chatIds = chats.map((c) => c.id)
    let messages: Message[] = []
    let sceneSummaries: SceneSummary[] = []
    for (const cid of chatIds) {
        messages = messages.concat(await db.messages.where('chatId').equals(cid).toArray())
        const ss = await db.sceneSummaries.where('chatId').equals(cid).first()
        if (ss) sceneSummaries.push(ss)
    }

    const moments = await db.moments.where('authorId').equals(characterId).toArray()
    const momentIds = moments.map((m) => m.id)
    let comments: MomentComment[] = []
    for (const mid of momentIds) {
        comments = comments.concat(await db.momentComments.where('momentId').equals(mid).toArray())
    }

    const data = {
        character: stripCharacterRuntime(character),
        lorebook: lorebookBundle,
        chats,
        messages,
        sceneSummaries,
        moments,
        comments,
    }
    download(`boxworld-character-${safeName(character.name)}-${dateStamp()}.json`, envelope('character_full', data))
}

/** 导出单本世界书 */
export async function exportLorebook(lorebookId: string) {
    const bundle = await collectLorebook(lorebookId)
    if (!bundle) throw new Error('世界书不存在')
    download(`boxworld-lorebook-${safeName(bundle.lorebook.name)}.json`, envelope('lorebook', bundle))
}

/** 导出单个预设 */
export async function exportPreset(presetId: string) {
    const preset = await db.presets.get(presetId)
    if (!preset) throw new Error('预设不存在')
    download(`boxworld-preset-${safeName(preset.name)}.json`, envelope('preset', { preset }))
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
    download(`boxworld-backup-${dateStamp()}.json`, envelope('full_backup', data))
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

async function importCharacterFull(data: any): Promise<ImportResult> {
    const c: Character = data.character
    if (!c) return { ok: false, message: '数据缺少角色信息' }

    const newLorebookId = await importLorebookBundle(data.lorebook)

    const now = Date.now()
    const newCharId = uuid()
    await db.characters.add({
        ...c,
        id: newCharId,
        lorebookId: newLorebookId,
        muted: c.muted ?? false,
        lastTickAt: 0,
        createdAt: now,
        updatedAt: now,
    })

    // chats + messages（重映射 chatId）
    const chatIdMap = new Map<string, string>()
    for (const chat of (data.chats as Chat[]) || []) {
        const newId = uuid()
        chatIdMap.set(chat.id, newId)
        await db.chats.add({ ...chat, id: newId, characterId: newCharId })
    }
    for (const m of (data.messages as Message[]) || []) {
        const newChatId = chatIdMap.get(m.chatId)
        if (!newChatId) continue
        await db.messages.add({ ...m, id: uuid(), chatId: newChatId })
    }
    for (const ss of (data.sceneSummaries as SceneSummary[]) || []) {
        const newChatId = chatIdMap.get(ss.chatId)
        if (!newChatId) continue
        await db.sceneSummaries.add({ ...ss, id: newChatId, chatId: newChatId })
    }

    // moments + comments（重映射 momentId，authorId 改成新角色）
    const momentIdMap = new Map<string, string>()
    for (const mo of (data.moments as Moment[]) || []) {
        const newId = uuid()
        momentIdMap.set(mo.id, newId)
        await db.moments.add({
            ...mo,
            id: newId,
            authorId: newCharId,
            imageDescriptions: mo.imageDescriptions || [],
            imageAnalyzed: mo.imageAnalyzed ?? true,
        })
    }
    for (const cm of (data.comments as MomentComment[]) || []) {
        const newMomentId = momentIdMap.get(cm.momentId)
        if (!newMomentId) continue
        // 评论作者：如果是原角色 id 则改成新角色 id；user 保持
        const newAuthorId = cm.authorId === c.id ? newCharId : cm.authorId
        await db.momentComments.add({ ...cm, id: uuid(), momentId: newMomentId, authorId: newAuthorId })
    }

    return { ok: true, type: 'character_full', message: `已导入角色「${c.name}」（完整包，含聊天与朋友圈）` }
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
