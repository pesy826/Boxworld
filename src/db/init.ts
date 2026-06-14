import { db } from './index'
import { createDefaultSettings, createDefaultComfyConfig, createDefaultVoiceConfig } from './defaults'
import { getBuiltinPresets } from './builtinPresets'

export async function initDatabase() {
  const existing = await db.settings.get('singleton')
  const defaults = createDefaultSettings()

  if (!existing) {
    await db.settings.add(defaults)
    console.log('[boxworld] 已初始化默认设置')
  } else {
    let apiConfig = existing.apiConfig as any
    if (apiConfig && !apiConfig.primary) {
      apiConfig = {
        ...defaults.apiConfig,
        primary: {
          baseUrl: apiConfig.baseUrl || defaults.apiConfig.primary.baseUrl,
          apiKey: apiConfig.apiKey || '',
          model: apiConfig.model || '',
        },
        utility: { baseUrl: '', apiKey: '', model: '' },
        temperature: apiConfig.temperature ?? defaults.apiConfig.temperature,
        maxTokens: apiConfig.maxTokens ?? defaults.apiConfig.maxTokens,
        topP: apiConfig.topP ?? defaults.apiConfig.topP,
        frequencyPenalty: apiConfig.frequencyPenalty ?? defaults.apiConfig.frequencyPenalty,
        presencePenalty: apiConfig.presencePenalty ?? defaults.apiConfig.presencePenalty,
        seed: apiConfig.seed ?? defaults.apiConfig.seed,
        stream: apiConfig.stream ?? defaults.apiConfig.stream,
        contextSize: apiConfig.contextSize ?? defaults.apiConfig.contextSize,
      }
      console.log('[boxworld] 旧 API 配置已迁移到 primary')
    }

    const utilityPresetMap = (existing as any).utilityPresetMap || defaults.utilityPresetMap
    const chatBehavior = (existing as any).chatBehavior || defaults.chatBehavior
    // userPersona 只保留 name + avatar（去掉 description）
    const oldPersona = existing.userPersona as any
    const userPersona = {
      name: oldPersona?.name || defaults.userPersona.name,
      avatar: oldPersona?.avatar,
    }

    await db.settings.put({
      ...existing,
      apiConfig: { ...defaults.apiConfig, ...apiConfig },
      userPersona,
      virtualTime: { ...defaults.virtualTime, ...existing.virtualTime },
      tickConfig: { ...defaults.tickConfig, ...(existing as any).tickConfig },
      chatBehavior: { ...defaults.chatBehavior, ...chatBehavior },
      utilityPresetMap: { ...defaults.utilityPresetMap, ...utilityPresetMap },
      activeSoloCharacterId: (existing as any).activeSoloCharacterId,
      comfyConfig: { ...createDefaultComfyConfig(), ...(existing as any).comfyConfig },
      voiceConfig: { ...createDefaultVoiceConfig(), ...(existing as any).voiceConfig },
      promptTemplates: undefined,
    } as any)
  }

  const builtins = getBuiltinPresets()
  for (const p of builtins) {
    const exists = await db.presets.get(p.id)
    if (!exists) {
      await db.presets.add(p)
      console.log(`[boxworld] 已添加内置预设：${p.name}`)
    }
  }

  // ===== 迁移：内置聊天预设补 private_memory 槽位 =====
  for (const id of ['builtin-im', 'builtin-scene']) {
    const preset = await db.presets.get(id)
    if (!preset) continue
    if (preset.slots.some((s) => s.role === 'private_memory')) continue
    const template = builtins.find((b) => b.id === id)
    const slot = template?.slots.find((s) => s.role === 'private_memory')
    if (!slot) continue
    // 插到 lore_before 之后（找不到就插在 history 之前，再不行就追加）
    const slots = [...preset.slots]
    let idx = slots.findIndex((s) => s.role === 'lorebook_before')
    if (idx < 0) idx = slots.findIndex((s) => s.role === 'history') - 1
    if (idx < 0) idx = slots.length - 1
    slots.splice(idx + 1, 0, { ...slot })
    await db.presets.put({ ...preset, slots, updatedAt: Date.now() })
    console.log(`[boxworld] 内置预设 ${id} 已补充 private_memory 槽位`)
  }

  // ===== 迁移：内置深思 prompt 补 memory_sync 字段说明 =====
  {
    const thinking = await db.presets.get('builtin-util-thinking')
    const template = builtins.find((b) => b.id === 'builtin-util-thinking')
    if (thinking && template && !thinking.slots[0]?.content.includes('memory_sync')) {
      await db.presets.put({ ...thinking, slots: template.slots, updatedAt: Date.now() })
      console.log('[boxworld] 内置深思预设已更新（memory_sync）')
    }
  }

  // ===== 迁移：聊天预设 prompt 全面改版（2026-06，去"扮演/盒世界"措辞 + 加破限/文风/禁词槽位） =====
  // 检测旧主提示词措辞（含"盒世界"或"你扮演的是"），命中则用新模板整体覆盖该内置预设的 slots。
  for (const id of ['builtin-im', 'builtin-scene']) {
    const preset = await db.presets.get(id)
    const template = builtins.find((b) => b.id === id)
    if (!preset || !template) continue
    const mainSlot = preset.slots.find((s) => s.role === 'static' && (s.id === 'main' || s.name === '主提示词'))
    const old = mainSlot?.content || ''
    if (old.includes('盒世界') || old.includes('你扮演的是') || old.includes('进行线下场景的角色扮演')) {
      await db.presets.put({ ...preset, slots: template.slots, updatedAt: Date.now() })
      console.log(`[boxworld] 内置预设 ${id} 已更新（去扮演措辞 + 破限/文风/禁词）`)
    }
  }

  // ===== 迁移：朋友圈主动性调优（2026-06，粗筛放宽朋友圈门槛 + 深思积极经营朋友圈） =====
  {
    const thinking = await db.presets.get('builtin-util-thinking')
    const template = builtins.find((b) => b.id === 'builtin-util-thinking')
    if (thinking && template && !thinking.slots[0]?.content.includes('积极经营')) {
      await db.presets.put({ ...thinking, slots: template.slots, updatedAt: Date.now() })
      console.log('[boxworld] 内置深思预设已更新（朋友圈主动性）')
    }
    const screening = await db.presets.get('builtin-util-screening')
    const screenTpl = builtins.find((b) => b.id === 'builtin-util-screening')
    if (screening && screenTpl && !screening.slots[0]?.content.includes('低打扰行为')) {
      await db.presets.put({ ...screening, slots: screenTpl.slots, updatedAt: Date.now() })
      console.log('[boxworld] 内置粗筛预设已更新（朋友圈主动性）')
    }
  }

  // ===== 迁移：群聊精细模式 prompt 改克制版（2026-06，允许看到不回 / 冷场是常态 / 不必聊满轮次） =====
  {
    const groupFine = await db.presets.get('builtin-util-group-fine')
    const template = builtins.find((b) => b.id === 'builtin-util-group-fine')
    if (groupFine && template && !groupFine.slots[0]?.content.includes('看到了但不想回')) {
      await db.presets.put({ ...groupFine, slots: template.slots, updatedAt: Date.now() })
      console.log('[boxworld] 内置群聊精细预设已更新（克制接话）')
    }
  }

  const settings = await db.settings.get('singleton')
  if (settings) {
    let patched = false
    const next = { ...settings }
    if (!next.defaultImPresetId) {
      next.defaultImPresetId = 'builtin-im'
      patched = true
    }
    if (!next.defaultScenePresetId) {
      next.defaultScenePresetId = 'builtin-scene'
      patched = true
    }
    if (patched) await db.settings.put(next)
  }

  console.log('[boxworld] 数据库就绪')
}
