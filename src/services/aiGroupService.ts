import { callChatCompletion } from './apiService'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { useChatStore } from '../stores/chatStore'
import { useAvatarLibStore } from '../stores/assetStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { uuid } from '../utils/id'
import { normalizeGender, inferGenderFromText, detectElder, detectYoung, buildAvatarPreference } from '../utils/avatarTags'
import { decodeHtmlEntities, tryParseJsonLoose } from '../utils/text'
import type { Character, Chat } from '../types'

export interface AiGroupResult {
  ok: boolean
  error?: string
  chat?: Chat
  /** 新生成的 NPC 名单（非好友，仅存在于群里） */
  createdNpcs?: Array<{ name: string; relation: string }>
}

interface GroupGenReply {
  name: string
  member_names: string[]
  new_npcs: Array<{
    name: string
    gender?: string
    relation: string
    personality: string
    description: string
  }>
  first_messages: Array<{ speaker: string; content: string }>
}

/**
 * AI 智能拉群（用户主动触发）。
 * 根据用户一句话需求，AI 决定群名、拉哪些已有角色、是否生成新 NPC、开场消息。
 * 新 NPC 标记 isContact: false（仅存在于群聊，加好友后才进通讯录）。
 */
export async function generateGroupChat(userRequest: string): Promise<AiGroupResult> {
  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }

  const primary = settings.apiConfig.primary
  if (!primary.apiKey || !primary.baseUrl || !primary.model) {
    return { ok: false, error: '主 API 未配置' }
  }

  const promptTemplate = getActiveUtilityPrompt('group_generate')
  if (!promptTemplate) return { ok: false, error: '未找到 AI 拉群 prompt' }

  const activeSoloId = settings.activeSoloCharacterId
  const allCharacters = useCharacterStore.getState().characters

  // 可拉入的角色：单卡模式 = 主卡 + 该世界好友 NPC；全局模式 = 所有主卡
  const candidates = activeSoloId
    ? allCharacters.filter(
      (c) =>
        c.id === activeSoloId ||
        (c.isNpc && c.parentWorldId === activeSoloId && c.isContact !== false),
    )
    : allCharacters.filter((c) => !c.isNpc)

  if (candidates.length === 0) return { ok: false, error: '没有可拉入的角色' }

  // 世界背景（单卡模式用主卡信息）
  const mainChar = activeSoloId ? useCharacterStore.getState().getById(activeSoloId) : undefined

  const candidateLines = candidates.map((c) => {
    const brief = (c.npcRelation || c.personality || c.description || '').slice(0, 60).replace(/\s+/g, ' ')
    return `- ${c.name}${brief ? `（${brief}）` : ''}`
  }).join('\n')

  // 已有群聊（避免重复建类似的群）
  const existingGroups = useChatStore.getState().chats
    .filter((c) => c.type === 'group' && (activeSoloId ? c.worldId === activeSoloId : !c.worldId))
  const existingGroupText = existingGroups.length > 0
    ? existingGroups.map((g) => `- ${g.name || '未命名群'}`).join('\n')
    : '（暂无）'

  const userPrompt = `${mainChar ? `【世界背景（主角档案）】
姓名：${mainChar.name}
描述：${(mainChar.description || '').slice(0, 2000)}
性格：${(mainChar.personality || '').slice(0, 500)}
${mainChar.scenario ? `场景：${mainChar.scenario.slice(0, 500)}` : ''}

` : ''}【用户信息】
昵称：${settings.userPersona.name}${mainChar?.userProfile ? `\n人设：${mainChar.userProfile}` : ''}

【可拉入的已有角色】
${candidateLines}

【已存在的群聊】
${existingGroupText}
${activeSoloId ? '' : `
【限制】当前为全局模式，不能生成新 NPC（new_npcs 必须给 []），只能从已有角色中拉人。`}

【用户的建群需求】
${userRequest || '根据世界观和人物关系，建一个合适的群'}

请设计这个群聊。`

  const result = await callChatCompletion(
    primary,
    settings.apiConfig,
    [
      { role: 'system', content: promptTemplate },
      { role: 'user', content: userPrompt },
    ],
    {
      debugPurpose: 'thinking',
      debugCharacterName: mainChar?.name || 'AI拉群',
      debugEndpointName: 'primary',
    },
  )

  if (!result.ok) return { ok: false, error: result.error }

  const parsed = parseGroupGenReply(result.content)
  if (!parsed) return { ok: false, error: '无法解析生成结果' }

  // 1. 匹配已有角色名 -> id
  const memberIds: string[] = []
  for (const name of parsed.member_names) {
    const found = matchCharacterByName(name, candidates)
    if (found && !memberIds.includes(found.id)) memberIds.push(found.id)
  }

  // 2. 创建新 NPC（仅单卡模式；非好友，只存在于群里）
  const createdNpcs: Array<{ name: string; relation: string }> = []
  const existingNames = new Set(allCharacters.map((c) => c.name))
  if (activeSoloId) {
    const now = Date.now()
    for (const npc of parsed.new_npcs.slice(0, 3)) {
      if (!npc.name?.trim() || existingNames.has(npc.name.trim())) continue
      const npcId = uuid()
      // 性别归一化（AI 没给则从名字/关系/描述推断）+ 长辈识别，按优先级降级匹配头像
      const profileText = `${npc.name} ${npc.relation} ${npc.description}`
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
        firstMes: '',
        mesExample: '',
        systemPrompt: undefined,
        postHistoryInstructions: undefined,
        alternateGreetings: [],
        creatorNotes: undefined,
        tags: [],
        imFirstMes: '',
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
        parentWorldId: activeSoloId,
        npcRelation: npc.relation || '',
        isContact: false,
        privateMemory: '',
        createdAt: now,
        updatedAt: now,
      }
      await useCharacterStore.getState().add(char)
      memberIds.push(char.id)
      createdNpcs.push({ name: char.name, relation: char.npcRelation || '' })
    }
  }

  if (memberIds.length < 2) {
    return { ok: false, error: `AI 选出的成员不足 2 人（匹配到 ${memberIds.length} 人），请换个说法重试` }
  }

  // 3. 建群
  const groupName = parsed.name?.trim() || defaultGroupName(memberIds)
  const chat = await useChatStore.getState().createGroupChat(
    groupName, memberIds, activeSoloId || undefined,
  )

  // 4. 写入开场消息
  await useChatStore.getState().appendSystemNotice(chat.id, '群聊已创建')
  const memberChars = memberIds
    .map((id) => useCharacterStore.getState().getById(id))
    .filter((c): c is Character => !!c)
  const batchId = uuid()
  for (const fm of parsed.first_messages.slice(0, 5)) {
    const sender = matchCharacterByName(fm.speaker, memberChars)
    if (!sender || !fm.content?.trim()) continue
    await useChatStore.getState().appendAssistantMessageWithBatch(
      chat.id,
      { type: 'text', content: fm.content.trim(), senderId: sender.id },
      batchId,
    )
  }

  return { ok: true, chat, createdNpcs }
}

/** 名字匹配（复用群聊调度的宽松策略：精确 → 去括号 → 前缀 → 包含） */
function matchCharacterByName(speaker: string, list: Character[]): Character | undefined {
  const name = speaker.trim()
  if (!name) return undefined
  let found = list.find((c) => c.name === name)
  if (found) return found
  const stripped = name.replace(/[（(].*?[)）]/g, '').trim()
  if (stripped && stripped !== name) {
    found = list.find((c) => c.name === stripped)
    if (found) return found
  }
  // speaker 以成员名开头（取最长）
  const prefixMatches = list.filter((c) => name.startsWith(c.name))
  if (prefixMatches.length > 0) {
    return prefixMatches.sort((a, b) => b.name.length - a.name.length)[0]
  }
  // 成员名包含 speaker 或 speaker 包含成员名
  found = list.find((c) => c.name.includes(name) || name.includes(c.name))
  return found
}

function defaultGroupName(memberIds: string[]): string {
  const names = memberIds
    .map((id) => useCharacterStore.getState().getById(id)?.name)
    .filter(Boolean)
    .slice(0, 3)
  return names.join('、') + (memberIds.length > 3 ? `等${memberIds.length}人` : '')
}

function parseGroupGenReply(raw: string): GroupGenReply | null {
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
  if (!obj) return null
  try {
    const memberNames = Array.isArray(obj.member_names)
      ? obj.member_names.map((x: any) => String(x ?? '').trim()).filter(Boolean)
      : []
    const newNpcs = Array.isArray(obj.new_npcs)
      ? obj.new_npcs.map((n: any) => ({
        name: decodeHtmlEntities(String(n?.name ?? '').trim()),
        gender: typeof n?.gender === 'string' ? n.gender.trim() : undefined,
        relation: decodeHtmlEntities(String(n?.relation ?? '').trim()),
        personality: decodeHtmlEntities(String(n?.personality ?? '').trim()),
        description: decodeHtmlEntities(String(n?.description ?? '').trim()),
      })).filter((n: any) => n.name)
      : []
    const firstMessages = Array.isArray(obj.first_messages)
      ? obj.first_messages.map((m: any) => ({
        speaker: decodeHtmlEntities(String(m?.speaker ?? '').trim()),
        content: decodeHtmlEntities(String(m?.content ?? '').trim()),
      })).filter((m: any) => m.speaker && m.content)
      : []
    return {
      name: decodeHtmlEntities(String(obj.name ?? '').trim()),
      member_names: memberNames,
      new_npcs: newNpcs,
      first_messages: firstMessages,
    }
  } catch {
    return null
  }
}