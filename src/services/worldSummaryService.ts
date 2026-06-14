import { db } from '../db'
import { callChatCompletion } from './apiService'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { useWorldSummaryStore } from '../stores/worldSummaryStore'
import { useTickLogStore } from '../stores/tickLogStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { uuid } from '../utils/id'
import type { Message } from '../types'

/**
 * 更新某单卡世界的统一事件记忆。
 * 增量扫描：只看各角色（主卡+NPC）上次扫描位置之后的新消息。
 * 返回是否真的更新了。
 */
export async function updateWorldSummary(worldId: string, runId: string): Promise<boolean> {
  const log = (entry: any) => useTickLogStore.getState().log({ ...entry, runId })

  const settings = useSettingsStore.getState().settings
  if (!settings) return false

  const mainChar = useCharacterStore.getState().getById(worldId)
  if (!mainChar) return false

  // 该世界所有角色：主卡 + NPC
  const npcs = useCharacterStore.getState().getNpcsOfWorld(worldId)
  const worldChars = [mainChar, ...npcs]

  // 直接读 db（双保险：即使 store 未加载也能拿到已有记录，避免 scannedSeq 失效从零重扫/覆盖老记忆）
  const existing = await db.worldSummaries.get(worldId)
    ?? useWorldSummaryStore.getState().get(worldId)
  const scannedSeq = existing?.scannedSeq || {}

  // 收集各角色的"增量"消息
  const newEventLines: string[] = []
  const newScannedSeq: Record<string, number> = { ...scannedSeq }

  for (const c of worldChars) {
    const chat = await db.chats
      .where('characterId').equals(c.id)
      .filter((ch) => (ch.type ?? 'single') === 'single')
      .first()
    if (!chat) continue
    const lastScanned = scannedSeq[c.id] || 0
    const msgs = await db.messages
      .where('chatId').equals(chat.id)
      .filter((m) => m.sequence > lastScanned && (m.type === 'text' || m.type === 'scene_narrative'))
      .toArray()
    msgs.sort((a, b) => a.sequence - b.sequence)
    if (msgs.length === 0) continue

    newScannedSeq[c.id] = msgs[msgs.length - 1].sequence

    const who = c.id === worldId ? c.name : `${c.name}（${c.npcRelation || 'NPC'}）`
    newEventLines.push(`# 用户与「${who}」的近期互动：`)
    for (const m of msgs) {
      const speaker = m.role === 'user' ? '用户' : c.name
      newEventLines.push(`${speaker}: ${m.content}`)
    }
    newEventLines.push('')
  }

  // 该世界的群聊（scannedSeq 用 "group:" + 群 chat.id 作 key）
  const groupChats = await db.chats
    .where('worldId').equals(worldId)
    .filter((ch) => ch.type === 'group')
    .toArray()
  for (const gc of groupChats) {
    const key = `group:${gc.id}`
    const lastScanned = scannedSeq[key] || 0
    const msgs = await db.messages
      .where('chatId').equals(gc.id)
      .filter((m) => m.sequence > lastScanned && m.type === 'text')
      .toArray()
    msgs.sort((a, b) => a.sequence - b.sequence)
    if (msgs.length === 0) continue

    newScannedSeq[key] = msgs[msgs.length - 1].sequence

    newEventLines.push(`# 群聊「${gc.name || '群聊'}」的近期记录：`)
    for (const m of msgs) {
      const speaker = m.role === 'user'
        ? '用户'
        : (m.senderId ? (useCharacterStore.getState().getById(m.senderId)?.name || '某成员') : '某成员')
      newEventLines.push(`${speaker}: ${m.content}`)
    }
    newEventLines.push('')
  }

  if (newEventLines.length === 0) {
    return false  // 没有增量
  }

  const endpoint = useSettingsStore.getState().getUtilityEndpoint()
  if (!endpoint) {
    await log({ stage: 'summary', result: 'fail', characterId: worldId, characterName: mainChar.name, reason: '世界记忆：无可用 API' })
    return false
  }

  const promptTemplate = getActiveUtilityPrompt('world_summary')
  if (!promptTemplate) return false

  const userContent = `【已有的世界事件记录】
${existing?.content?.trim() || '（暂无，这是首次记录）'}

【新发生的对话/动态片段】
${newEventLines.join('\n')}

请提炼已发生的客观事件，输出更新后的完整世界事件记录。`

  const result = await callChatCompletion(
    endpoint,
    settings.apiConfig,
    [
      { role: 'system', content: promptTemplate },
      { role: 'user', content: userContent },
    ],
    {
      maxTokensOverride: 1024,
      temperatureOverride: 0.4,
      debugPurpose: 'moment_summary',
      debugEndpointName: 'utility',
    },
  )

  if (!result.ok) {
    await log({ stage: 'summary', result: 'fail', characterId: worldId, characterName: mainChar.name, reason: `世界记忆失败：${result.error}` })
    return false
  }

  const content = result.content.trim()
  if (!content) return false

  await useWorldSummaryStore.getState().upsert({
    id: existing?.id || uuid(),
    worldId,
    content,
    scannedSeq: newScannedSeq,
    updatedAt: Date.now(),
  })

  await log({
    stage: 'summary', result: 'success',
    characterId: worldId, characterName: mainChar.name,
    reason: '更新世界事件记忆',
    detail: content.slice(0, 100),
  })

  return true
}
