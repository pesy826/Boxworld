import { uuid } from '../utils/id'
import { db } from '../db'
import { timeService } from './timeService'
import { callChatCompletion } from './apiService'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTickLogStore } from '../stores/tickLogStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { thinkForCharacter } from './thinkingService'
import { updateSceneSummaryForChat } from './sceneSummaryService'
import { pLimit } from '../utils/concurrency'
import type { Character } from '../types'

export type TickReason =
  | 'startup'
  | 'manual'
  | 'page_enter'
  | 'time_jump'
  | 'post_user_message'

export interface TickOptions {
  reason: TickReason
  characterIds?: string[]
  ignoreCooldown?: boolean
}

export interface TickResult {
  runId: string
  candidates: string[]
  screened: string[]
  applied: string[]
}

let runningPromise: Promise<TickResult> | null = null

export async function tick(options: TickOptions): Promise<TickResult> {
  if (runningPromise) {
    console.log('[tick] 已有 tick 在运行，跳过')
    return runningPromise
  }
  runningPromise = doTick(options).finally(() => {
    runningPromise = null
  })
  return runningPromise
}

export async function startupTick(): Promise<void> {
  const settings = useSettingsStore.getState().settings
  if (!settings) return
  if (!settings.tickConfig.startupTickEnabled) {
    console.log('[tick] 启动补算已禁用')
    return
  }
  await tick({ reason: 'startup' })
}

async function doTick(options: TickOptions): Promise<TickResult> {
  const runId = uuid().slice(0, 8)
  const result: TickResult = { runId, candidates: [], screened: [], applied: [] }

  const log = (entry: any) => useTickLogStore.getState().log({ ...entry, runId })

  console.log(`[tick:${runId}] 开始 reason=${options.reason}`)

  const settings = useSettingsStore.getState().settings
  if (!settings) {
    await log({ stage: 'heuristic', result: 'fail', reason: '设置未加载' })
    return result
  }
  const primary = settings.apiConfig.primary
  if (!primary.apiKey || !primary.baseUrl || !primary.model) {
    await log({ stage: 'heuristic', result: 'fail', reason: '主 API 未配置' })
    return result
  }

  const allCharacters = useCharacterStore.getState().characters
  const activeSoloId = settings.activeSoloCharacterId

  let candidates: Character[]
  if (options.characterIds) {
    const set = new Set(options.characterIds)
    candidates = allCharacters.filter((c) => set.has(c.id))
  } else {
    candidates = allCharacters.filter((c) => {
      if (!c.isNpc) {
        // 主卡：全局模式参与；单卡模式只有当前激活的主卡参与
        if (activeSoloId) return c.id === activeSoloId
        return true
      } else {
        // NPC：只在它所属世界被激活时参与；非好友 NPC（仅存在于群聊）不参与单聊主动行为
        if (c.isContact === false) return false
        return activeSoloId !== undefined && c.parentWorldId === activeSoloId
      }
    })
  }


  if (candidates.length === 0) {
    await log({ stage: 'heuristic', result: 'skipped', reason: '无候选角色' })
    return result
  }

  // Phase 0: 图片解析（与角色无关，对全局用户朋友圈生效）
  try {
    const { analyzeUnprocessedUserMoments } = await import('./imageDescribeService')
    const r = await analyzeUnprocessedUserMoments()
    if (r.processed > 0) {
      await log({
        stage: 'summary', result: 'success',
        reason: `解析 ${r.processed} 条用户朋友圈图片`,
      })
    }
  } catch (e) {
    await log({
      stage: 'summary', result: 'fail',
      reason: `图片解析异常：${(e as any)?.message || e}`,
    })
  }
  // Phase 0.5: 朋友圈摘要（如果开启且超阈值）
  try {
    const { updateUserMomentsSummary } = await import('./momentSummaryService')
    await updateUserMomentsSummary(runId)
  } catch (e) {
    await log({
      stage: 'summary', result: 'fail',
      reason: `朋友圈摘要异常：${(e as any)?.message || e}`,
    })
  }

  // Phase 0.7: 世界记忆更新（仅单卡模式，更新当前世界）
  const activeSolo = settings.activeSoloCharacterId
  if (activeSolo) {
    try {
      const { updateWorldSummary } = await import('./worldSummaryService')
      await updateWorldSummary(activeSolo, runId)
    } catch (e) {
      await log({ stage: 'summary', result: 'fail', reason: `世界记忆异常：${(e as any)?.message || e}` })
    }
  }

  // Phase 1: 启发式过滤
  const passed: Character[] = []
  for (const c of candidates) {
    const verdict = heuristicFilter(c, options)
    if (verdict.pass) {
      passed.push(c)
      await log({
        stage: 'heuristic', result: 'pass',
        characterId: c.id, characterName: c.name, reason: verdict.reason,
      })
    } else {
      await log({
        stage: 'heuristic', result: 'skipped',
        characterId: c.id, characterName: c.name, reason: verdict.reason,
      })
    }
  }
  result.candidates = passed.map((c) => c.id)

  if (passed.length === 0) return result

  // Phase 2: 场景摘要更新
  const summaryTasks = passed.map((c) => async () => {
    try {
      const chat = await db.chats.where('characterId').equals(c.id).first()
      if (!chat) return
      await updateSceneSummaryForChat(chat.id, c, runId)
    } catch (e) {
      await log({
        stage: 'summary', result: 'fail',
        characterId: c.id, characterName: c.name,
        reason: `异常：${(e as any)?.message || e}`,
      })
    }
  })
  await pLimit(summaryTasks, settings.tickConfig.maxConcurrency || 3)

  // Phase 3: AI 粗筛
  const screenedIds = await aiScreening(passed, runId)
  result.screened = screenedIds
  console.log(`[tick:${runId}] AI 粗筛后剩 ${screenedIds.length}/${passed.length}`)

  // lastTickAt 用各角色自己的有效时间（单卡模式下是世界时间），与 heuristicFilter 的比较基准一致
  for (const c of passed) {
    await useCharacterStore.getState().update(c.id, { lastTickAt: timeService.nowForCharacter(c) })
  }

  if (screenedIds.length === 0) return result

  // Phase 4: 深思
  const concurrency = settings.tickConfig.maxConcurrency || 3
  const tasks = screenedIds.map((id) => async () => {
    try {
      const r = await thinkForCharacter(id, runId)
      if (r.ok) result.applied.push(id)
    } catch (e) {
      const c = allCharacters.find((x) => x.id === id)
      await log({
        stage: 'decide', result: 'fail',
        characterId: id, characterName: c?.name,
        reason: `深思异常：${(e as any)?.message || e}`,
      })
    }
  })
  await pLimit(tasks, concurrency)

  console.log(`[tick:${runId}] 深思完成，${result.applied.length}/${screenedIds.length} 应用成功`)

  return result
}


interface HeuristicVerdict {
  pass: boolean
  reason: string
}

function heuristicFilter(c: Character, options: TickOptions): HeuristicVerdict {
  if (c.muted) return { pass: false, reason: '已静默' }

  const settings = useSettingsStore.getState().settings!


  // 时间锁定：进过单卡、时间超前，且【当前不在这张卡的单卡模式】
  const activeSolo = useSettingsStore.getState().settings?.activeSoloCharacterId
  {
    const activeSolo = useSettingsStore.getState().settings?.activeSoloCharacterId
    const worldId = c.isNpc ? c.parentWorldId : c.id
    const isActiveWorld = !!activeSolo && worldId === activeSolo
    if (!isActiveWorld && timeService.isLocked(c)) {
      return { pass: false, reason: '时间锁定中（独立时间线超前于全局）' }
    }
  }



  const now = timeService.nowForCharacter(c)
  const cooldownMs = settings.tickConfig.cooldownMinutes * 60 * 1000

  if (!options.ignoreCooldown && c.lastTickAt > 0) {
    const sinceLastTick = now - c.lastTickAt
    if (sinceLastTick < cooldownMs) {
      const minutes = Math.floor(sinceLastTick / 60000)
      return { pass: false, reason: `冷却中（距上次 ${minutes} 分钟）` }
    }
  }

  if (options.reason === 'startup') {
    const minHours = settings.tickConfig.startupMinIntervalHours
    if (minHours > 0 && c.lastTickAt > 0) {
      const sinceLastTick = now - c.lastTickAt
      if (sinceLastTick < minHours * 3600 * 1000) {
        const hours = (sinceLastTick / 3600000).toFixed(1)
        return { pass: false, reason: `启动补算最小间隔未到（仅 ${hours} 小时）` }
      }
    }
  }

  return { pass: true, reason: '通过启发式' }
}



async function aiScreening(candidates: Character[], runId: string): Promise<string[]> {
  const log = (entry: any) => useTickLogStore.getState().log({ ...entry, runId })

  const settings = useSettingsStore.getState().settings!
  const utilityEndpoint = useSettingsStore.getState().getUtilityEndpoint()
  if (!utilityEndpoint) {
    await log({ stage: 'screen', result: 'fail', reason: '无可用 API 端点' })
    return []
  }

  const lines: string[] = []
  // 粗筛基准时间：单卡模式用激活世界的时间，否则全局时间
  const activeSoloId = useSettingsStore.getState().settings?.activeSoloCharacterId
  const activeSoloChar = activeSoloId ? useCharacterStore.getState().getById(activeSoloId) : undefined
  const now = activeSoloChar ? timeService.nowForCharacter(activeSoloChar) : timeService.now()

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const chat = await db.chats
      .where('characterId').equals(c.id)
      .filter((ch) => (ch.type ?? 'single') === 'single')
      .first()
    let lastMessageAt = 0
    if (chat) {
      const lastMsg = await db.messages
        .where('chatId').equals(chat.id)
        .reverse().sortBy('sequence')
        .then((arr) => arr[0])
      lastMessageAt = lastMsg?.timestamp || chat.lastMessageAt || 0
    }

    const charNow = timeService.nowForCharacter(c)
    const sinceMs = lastMessageAt > 0 ? charNow - lastMessageAt : -1
    const sinceText = sinceMs < 0
      ? '从未互动'
      : sinceMs < 3600 * 1000
        ? `${Math.floor(sinceMs / 60000)} 分钟前`
        : sinceMs < 86400 * 1000
          ? `${Math.floor(sinceMs / 3600000)} 小时前`
          : `${Math.floor(sinceMs / 86400000)} 天前`

    const lastAssistant = await db.messages
      .where('chatId').equals(chat?.id || '')
      .filter((m) => m.role === 'assistant' && !!m.mood)
      .reverse().sortBy('timestamp')
      .then((arr) => arr[0])
    const mood = lastAssistant?.mood || '未知'

    const personalityBrief = (c.personality || c.description).slice(0, 80).replace(/\s+/g, ' ')

    lines.push(
      `[${i + 1}] ${c.name} | 性格:${personalityBrief} | 上次活动:${sinceText} | 上次情绪:${mood}`,
    )
  }

  const currentTime = new Date(now).toLocaleString('zh-CN', { hour12: false })
  const systemPrompt = getActiveUtilityPrompt('screening')
  if (!systemPrompt) {
    await log({ stage: 'screen', result: 'fail', reason: '未找到粗筛 prompt' })
    return []
  }

  const userPrompt = `当前时间：${currentTime}

候选角色：
${lines.join('\n')}

请判断哪些角色现在应该主动行动。`

  const result = await callChatCompletion(
    utilityEndpoint, settings.apiConfig,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      maxTokensOverride: 512,
      temperatureOverride: 0.5,
      debugPurpose: 'screening',
      debugEndpointName: 'utility',
    },
  )

  if (!result.ok) {
    await log({ stage: 'screen', result: 'fail', reason: `API 失败：${result.error}` })
    return []
  }

  const parsed = parseScreenReply(result.content)
  if (!parsed) {
    await log({
      stage: 'screen', result: 'fail',
      reason: '无法解析返回',
      detail: result.content.slice(0, 200),
    })
    return []
  }

  const selectedIds: string[] = []
  for (const idx of parsed.selected) {
    const c = candidates[idx - 1]
    if (c) {
      selectedIds.push(c.id)
      await log({
        stage: 'screen', result: 'success',
        characterId: c.id, characterName: c.name,
        reason: parsed.reasons[String(idx)] || '（无原因）',
      })
    }
  }

  const selectedSet = new Set(selectedIds)
  for (const c of candidates) {
    if (!selectedSet.has(c.id)) {
      await log({
        stage: 'screen', result: 'skipped',
        characterId: c.id, characterName: c.name,
        reason: 'AI 粗筛未选中',
      })
    }
  }

  return selectedIds
}

function parseScreenReply(raw: string): { selected: number[]; reasons: Record<string, string> } | null {
  const cleaned = raw.trim()
  let jsonText = cleaned
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonText = fence[1]
  else {
    const fb = cleaned.indexOf('{')
    const lb = cleaned.lastIndexOf('}')
    if (fb >= 0 && lb > fb) jsonText = cleaned.slice(fb, lb + 1)
  }
  try {
    const obj = JSON.parse(jsonText)
    const selected = Array.isArray(obj.selected) ? obj.selected.filter((n: any) => typeof n === 'number') : []
    const reasons = (obj.reasons && typeof obj.reasons === 'object') ? obj.reasons : {}
    return { selected, reasons }
  } catch {
    return null
  }
}
