import { uuid } from '../utils/id'
import type { PromptSlot, SlotRole, SlotMessageRole } from '../types'

/**
 * 酒馆（SillyTavern）预设导入。
 *
 * 酒馆 Chat Completion 预设的两个关键字段：
 * - prompts[]：所有提示词块，含 { identifier, name, role, content, marker }
 *   - marker:true 的是内置占位块（角色描述/历史/世界书/人设等），content 通常为空
 *   - 其余是自定义文本块（破限/正文要求/文风/任务等），content 是真正的提示词
 * - prompt_order[]：[{ character_id, order:[{ identifier, enabled }] }]
 *   决定显示顺序与每块的启用状态。通常含两组：100000（默认）与 100001（用户自定义，更丰富）
 *
 * 转换策略：
 * - 读 prompt_order 取最丰富的一组，按其顺序与启用状态生成槽位
 * - marker 块映射成 BoxWorld 对应的内置槽位（角色描述/历史/世界书等）
 * - 其余块原样保留为 static 系统文本槽位（promptBuilder 对 static/jailbreak 逐字输出）
 * - 缺失 prompt_order 时按 prompts 数组顺序、全部启用
 */

/** 酒馆 marker identifier -> BoxWorld SlotRole */
const MARKER_MAP: Record<string, SlotRole> = {
  charDescription: 'char_description',
  charPersonality: 'char_personality',
  scenario: 'char_scenario',
  personaDescription: 'user_persona',
  dialogueExamples: 'char_mes_example',
  worldInfoBefore: 'lorebook_before',
  worldInfoAfter: 'lorebook_after',
  chatHistory: 'history',
}

interface STPrompt {
  identifier?: string
  name?: string
  role?: string
  content?: string
  marker?: boolean
}

interface STOrderItem {
  identifier?: string
  enabled?: boolean
}

function pickOrder(json: unknown): STOrderItem[] | null {
  const j = json as { prompt_order?: { order?: STOrderItem[] }[] }
  if (!Array.isArray(j?.prompt_order) || j.prompt_order.length === 0) return null
  // 取 order 最丰富的那一组（用户自定义组通常最长）
  const best = j.prompt_order.reduce((a, b) =>
    (b?.order?.length ?? 0) >= (a?.order?.length ?? 0) ? b : a,
  )
  return Array.isArray(best?.order) ? best.order : null
}

/** 判断是否像一个酒馆 Chat Completion 预设 */
export function looksLikeSillyTavernPreset(json: unknown): boolean {
  const j = json as { prompts?: unknown }
  return !!j && Array.isArray(j.prompts)
}

/**
 * 把酒馆预设 JSON 转成 BoxWorld 槽位数组 + 预设名。
 */
export function convertSillyTavernPreset(json: unknown): { name: string; slots: PromptSlot[] } {
  const j = json as { prompts?: STPrompt[]; name?: string; preset_name?: string }
  const prompts: STPrompt[] = Array.isArray(j?.prompts) ? j.prompts : []
  const byId = new Map<string, STPrompt>()
  for (const p of prompts) if (p?.identifier) byId.set(p.identifier, p)

  const order =
    pickOrder(json) ??
    prompts.map((p) => ({ identifier: p.identifier, enabled: true }))

  const slots: PromptSlot[] = []
  for (const item of order) {
    if (!item?.identifier) continue
    const p = byId.get(item.identifier)
    if (!p) continue

    const enabled = item.enabled !== false
    const messageRole: SlotMessageRole =
      p.role === 'user' || p.role === 'assistant' ? p.role : 'system'
    const role: SlotRole = MARKER_MAP[item.identifier] ?? 'static'

    slots.push({
      id: uuid(),
      name: p.name || item.identifier,
      role,
      messageRole,
      content: p.content || '',
      enabled,
    })
  }

  const name = (j?.name || j?.preset_name || '酒馆导入预设').toString()
  return { name, slots }
}