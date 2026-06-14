import { db } from '../db'
import { callChatCompletion } from './apiService'
import { useSettingsStore } from '../stores/settingsStore'
import { useTickLogStore } from '../stores/tickLogStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { uuid } from '../utils/id'

const USER_ID = 'user'

/**
 * 摘要用户朋友圈：当用户朋友圈数量超过阈值时，把"较老的"朋友圈摘要成重要事项。
 * 保留最近 5 条不摘要（由 promptBuilder 直接读原文）。
 */
export async function updateUserMomentsSummary(runId: string): Promise<boolean> {
  const log = (entry: any) => useTickLogStore.getState().log({ ...entry, runId })

  const settings = useSettingsStore.getState().settings
  if (!settings) return false
  if (!settings.tickConfig.momentSummaryEnabled) return false

  const threshold = settings.tickConfig.momentSummaryThreshold
  const all = await db.moments.where('authorId').equals(USER_ID).reverse().sortBy('timestamp')
  if (all.length <= threshold) return false

  // 需要摘要的：除最近 5 条外的所有
  const KEEP_RECENT = 5
  const toSummarize = all.slice(KEEP_RECENT)
  if (toSummarize.length === 0) return false

  // 检查是否已经摘要到这个范围（用最老一条的 timestamp 作为标记不太准，简单起见每次重算）
  const existing = await db.momentSummaries
    .where('scope').equals('user_moments')
    .and((s) => s.ownerId === USER_ID)
    .first()

  const newestSummarizedTs = toSummarize[0].timestamp
  if (existing && existing.upToTimestamp >= newestSummarizedTs) {
    return false  // 已经摘要过了
  }

  const endpoint = useSettingsStore.getState().getUtilityEndpoint()
  if (!endpoint) return false

  const promptTemplate = getActiveUtilityPrompt('moment_summary')
  if (!promptTemplate) return false

  // 构造输入（含图片描述）
  const lines: string[] = []
  for (const m of toSummarize.reverse()) {  // 时间正序
    const t = new Date(m.timestamp).toLocaleString('zh-CN', { hour12: false })
    let line = `${t}：${m.content}`
    if (m.images.length > 0) {
      const descs = m.imageDescriptions.filter((d) => d && !d.startsWith('[图片：'))
      if (descs.length > 0) line += `（图：${descs.join('；')}）`
    }
    lines.push(line)
  }

  const result = await callChatCompletion(
    endpoint,
    settings.apiConfig,
    [
      { role: 'system', content: promptTemplate },
      { role: 'user', content: lines.join('\n') },
    ],
    {
      maxTokensOverride: 1024,
      temperatureOverride: 0.4,
      debugPurpose: 'moment_summary',
      debugEndpointName: 'utility',
    },
  )

  if (!result.ok) {
    await log({ stage: 'summary', result: 'fail', reason: `朋友圈摘要失败：${result.error}` })
    return false
  }

  const content = result.content.trim()
  if (!content) return false

  await db.momentSummaries.put({
    id: existing?.id || uuid(),
    scope: 'user_moments',
    ownerId: USER_ID,
    content,
    upToTimestamp: newestSummarizedTs,
    createdAt: Date.now(),
  })

  await log({
    stage: 'summary', result: 'success',
    reason: `更新用户朋友圈摘要（摘要 ${toSummarize.length} 条）`,
    detail: content.slice(0, 100),
  })

  return true
}
