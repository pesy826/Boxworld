import { db } from '../db'
import { callChatCompletion } from './apiService'
import { useSettingsStore } from '../stores/settingsStore'
import { useSceneSummaryStore } from '../stores/sceneSummaryStore'
import { useTickLogStore } from '../stores/tickLogStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import type { Message, Character } from '../types'

/**
 * 给某个会话更新场景摘要。
 * - 检查该会话是否有"新于上次摘要"的 scene_narrative 消息
 * - 如有，调辅助模型，把已有摘要 + 新消息合成一份新摘要
 */
export async function updateSceneSummaryForChat(
    chatId: string,
    character: Character,
    runId: string,
): Promise<boolean> {
    const log = (entry: any) => useTickLogStore.getState().log({ ...entry, runId })

    // 1. 取所有场景叙事消息
    const allMsgs = await db.messages.where('chatId').equals(chatId).toArray()
    const sceneMsgs = allMsgs
        .filter((m) => m.type === 'scene_narrative')
        .sort((a, b) => a.sequence - b.sequence)

    if (sceneMsgs.length === 0) {
        return false
    }

    const lastSeq = sceneMsgs[sceneMsgs.length - 1].sequence
    const existing = useSceneSummaryStore.getState().get(chatId)

    if (existing && existing.upToSequence >= lastSeq) {
        // 没有新内容，跳过
        return false
    }

    // 2. 收集"新内容"（existing.upToSequence 之后的所有 scene_narrative）
    const newMsgs = existing
        ? sceneMsgs.filter((m) => m.sequence > existing.upToSequence)
        : sceneMsgs

    if (newMsgs.length === 0) return false

    // 3. 调辅助 API
    const settings = useSettingsStore.getState().settings
    if (!settings) return false
    const endpoint = useSettingsStore.getState().getUtilityEndpoint()
    if (!endpoint) {
        await log({
            stage: 'summary', result: 'fail',
            characterId: character.id, characterName: character.name,
            reason: '无可用 API 端点',
        })
        return false
    }

    const promptTemplate = getActiveUtilityPrompt('scene_summary')
    if (!promptTemplate) {
        await log({
            stage: 'summary', result: 'fail',
            characterId: character.id, characterName: character.name,
            reason: '未找到场景摘要 prompt',
        })
        return false
    }

    const systemPrompt = `${promptTemplate}

【角色信息】
你扮演的是：${character.name}
${character.description ? `角色描述：${character.description}` : ''}

【用户】
${settings.userPersona.name || '用户'}`

    const userContent = buildSummaryUserContent(existing?.content, newMsgs)

    const result = await callChatCompletion(
        endpoint,
        settings.apiConfig,
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
        ],
        {
            maxTokensOverride: 1024,
            temperatureOverride: 0.5,
            debugPurpose: 'scene_summary',
            debugCharacterName: character.name,
            debugEndpointName: 'utility',
        }
        ,
    )

    if (!result.ok) {
        await log({
            stage: 'summary', result: 'fail',
            characterId: character.id, characterName: character.name,
            reason: `API 失败：${result.error}`,
        })
        return false
    }

    const newSummary = result.content.trim()
    if (!newSummary) {
        await log({
            stage: 'summary', result: 'fail',
            characterId: character.id, characterName: character.name,
            reason: '摘要返回为空',
        })
        return false
    }

    // 4. 入库
    await useSceneSummaryStore.getState().upsert({
        id: chatId,
        chatId,
        content: newSummary,
        upToSequence: lastSeq,
        updatedAt: Date.now(),
    })

    await log({
        stage: 'summary', result: 'success',
        characterId: character.id, characterName: character.name,
        reason: `更新场景摘要（新增 ${newMsgs.length} 条片段）`,
        detail: newSummary.slice(0, 100),
    })

    return true
}

function buildSummaryUserContent(existingSummary: string | undefined, newMsgs: Message[]): string {
    const parts: string[] = []

    if (existingSummary?.trim()) {
        parts.push('【已有回忆】')
        parts.push(existingSummary.trim())
    } else {
        parts.push('【已有回忆】\n（无，这是首次回忆）')
    }

    parts.push('\n【新发生的剧情片段】')
    for (const m of newMsgs) {
        const who = m.role === 'user' ? '用户' : '我'
        parts.push(`[${who}]\n${m.content}`)
    }

    parts.push('\n请输出整合更新后的完整回忆。')
    return parts.join('\n\n')
}
