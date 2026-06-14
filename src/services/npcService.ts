import { callChatCompletion } from './apiService'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { useAvatarLibStore } from '../stores/assetStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { uuid } from '../utils/id'
import { normalizeGender, inferGenderFromText, detectElder, detectYoung, buildAvatarPreference } from '../utils/avatarTags'
import { decodeHtmlEntities, tryParseJsonLoose } from '../utils/text'
import type { Character } from '../types'

export interface GenerateNpcResult {
  ok: boolean
  error?: string
  npcs?: Array<{ name: string; relation: string }>
}

interface NpcReply {
  npcs: Array<{
    name: string
    gender?: string
    relation: string
    personality: string
    description: string
    first_message?: string
  }>
}

/**
 * 在某个单卡世界里生成 NPC。
 * worldCharacterId = 该世界主卡 id
 * userRequest = 用户的生成需求（一句话）
 */
export async function generateNpcs(
  worldCharacterId: string,
  userRequest: string,
): Promise<GenerateNpcResult> {
  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }

  const mainChar = useCharacterStore.getState().getById(worldCharacterId)
  if (!mainChar) return { ok: false, error: '主卡不存在' }

  const primary = settings.apiConfig.primary
  if (!primary.apiKey || !primary.baseUrl || !primary.model) {
    return { ok: false, error: '主 API 未配置' }
  }

  const promptTemplate = getActiveUtilityPrompt('npc_generate')
  if (!promptTemplate) return { ok: false, error: '未找到 NPC 生成 prompt' }

  // 已有 NPC（避免重名/重复）
  const existingNpcs = useCharacterStore.getState().getNpcsOfWorld(worldCharacterId)
  const existingText = existingNpcs.length > 0
    ? existingNpcs.map((n) => `- ${n.name}（${n.npcRelation || ''}）`).join('\n')
    : '（暂无）'

  const systemPrompt = `${promptTemplate}`

  const userPrompt = `【主角设定】
姓名：${mainChar.name}
描述：${mainChar.description}
性格：${mainChar.personality}
${mainChar.scenario ? `场景：${mainChar.scenario}` : ''}

【用户设定】
昵称：${settings.userPersona.name}

【已存在的 NPC】
${existingText}

【用户的生成需求】
${userRequest || '根据世界观和人物关系，生成合适的 NPC'}

请设计 NPC。`

  const result = await callChatCompletion(
    primary,
    settings.apiConfig,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      debugPurpose: 'thinking', // 复用现有调试类型；如需独立可加 npc_generate 到 PromptPurpose
      debugCharacterName: mainChar.name,
      debugEndpointName: 'primary',
    },
  )

  if (!result.ok) return { ok: false, error: result.error }

  const parsed = parseNpcReply(result.content)
  if (!parsed || parsed.npcs.length === 0) {
    return { ok: false, error: '无法解析生成结果，或未生成任何 NPC' }
  }

  // 写入 NPC（复用 Character）
  const created: Array<{ name: string; relation: string }> = []
  const now = Date.now()
  for (const npc of parsed.npcs) {
    if (!npc.name?.trim()) continue
    const npcId = uuid()
    // 从头像库自动分配（性别归一化，AI 没给则从名字/关系/描述推断 + 长辈识别，按优先级降级匹配）
    const profileText = `${npc.name} ${npc.relation} ${npc.description}`
    // 性别：优先 AI 给的 gender；没给/无效再从名字+关系+描述推断
    const gender = normalizeGender(npc.gender) ?? inferGenderFromText(profileText)
    const isElder = detectElder(profileText)
    const isYoung = !isElder && detectYoung(profileText)
    const genderExclude = gender === '男' ? '女' : gender === '女' ? '男' : undefined
    const avatarItem = await useAvatarLibStore.getState().takeAvatar(
      npcId, buildAvatarPreference(gender, isElder, isYoung), genderExclude,
    )
    const char: Character = {
      id: npcId,
      name: npc.name.trim(),
      avatar: avatarItem?.image,
      description: npc.description || '',
      personality: npc.personality || '',
      scenario: '',
      firstMes: npc.first_message || '',
      mesExample: '',
      systemPrompt: undefined,
      postHistoryInstructions: undefined,
      alternateGreetings: [],
      creatorNotes: undefined,
      tags: [],
      imFirstMes: npc.first_message || '',
      activeLevel: 5,
      lorebookId: undefined,
      imPresetId: undefined,
      scenePresetId: undefined,
      muted: false,
      lastTickAt: 0,
      soloModeEntered: false,
      soloVirtualTime: 0,
      soloRealAnchor: 0,
      isNpc: true,
      parentWorldId: worldCharacterId,
      npcRelation: npc.relation || '',
      isContact: true,
      privateMemory: '',
      createdAt: now,
      updatedAt: now,
    }
    await useCharacterStore.getState().add(char)
    created.push({ name: char.name, relation: char.npcRelation || '' })
  }

  return { ok: true, npcs: created }
}

function parseNpcReply(raw: string): NpcReply | null {
  const cleaned = raw.trim()
  let jsonText = cleaned
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonText = fence[1]
  else {
    const fb = cleaned.indexOf('{')
    const lb = cleaned.lastIndexOf('}')
    if (fb >= 0 && lb > fb) jsonText = cleaned.slice(fb, lb + 1)
  }
  const obj = tryParseJsonLoose(jsonText)
  if (!obj || !Array.isArray(obj.npcs)) return null
  try {
    const npcs = obj.npcs
      .map((n: any) => ({
        name: decodeHtmlEntities(String(n?.name ?? '').trim()),
        gender: typeof n?.gender === 'string' ? n.gender.trim() : undefined,
        relation: decodeHtmlEntities(String(n?.relation ?? '').trim()),
        personality: decodeHtmlEntities(String(n?.personality ?? '').trim()),
        description: decodeHtmlEntities(String(n?.description ?? '').trim()),
        first_message: typeof n?.first_message === 'string' ? decodeHtmlEntities(n.first_message.trim()) : undefined,
      }))
      .filter((n: any) => n.name)
    return { npcs }
  } catch {
    return null
  }
}
