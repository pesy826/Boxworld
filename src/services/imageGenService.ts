/**
 * 统一文生图入口。
 *
 * 盒世界有两个出图后端：
 * - comfy：本地 ComfyUI（仅桌面端）
 * - nai：NovelAI 官方（不限平台）
 *
 * settings.imageBackend 决定用哪个（旧数据无此字段视为 comfy）。
 * 聊天/朋友圈/群聊的出图链路统一调 generateImage / isImageGenAvailable，
 * 不再直接依赖 comfyService，方便后续再加后端。
 */
import { useSettingsStore } from '../stores/settingsStore'
import { isComfyAvailable, generateComfyImage, runImagePromptRewrite } from './comfyService'
import { isNaiAvailable, generateNaiImage } from './naiService'
import type { ImageBackend } from '../types'

export interface ImageGenResult {
  ok: boolean
  image?: string
  error?: string
}

/** 当前选用的出图后端（旧数据视为 comfy） */
export function getImageBackend(): ImageBackend {
  return useSettingsStore.getState().settings?.imageBackend || 'comfy'
}

/** 当前所选后端是否可用——角色发图能力的总开关（promptBuilder/thinking 据此决定是否注入发图提示词） */
export function isImageGenAvailable(): boolean {
  return getImageBackend() === 'nai' ? isNaiAvailable() : isComfyAvailable()
}

/** 统一出图：按后端分发 */
export async function generateImage(prompt: string): Promise<ImageGenResult> {
  return getImageBackend() === 'nai' ? generateNaiImage(prompt) : generateComfyImage(prompt)
}

/**
 * 出图前可选地用辅助模型把中文描述改写成规范英文提示词。
 * 是否启用取决于当前后端各自的 promptGenEnabled；改写核心逻辑用
 * comfyService.runImagePromptRewrite（读 image_prompt_gen 预设 + 辅助模型，与后端无关）。
 */
export async function refineImagePrompt(chineseDesc: string): Promise<string> {
  const s = useSettingsStore.getState().settings
  const backend = getImageBackend()
  const enabled = backend === 'nai'
    ? !!s?.naiConfig?.promptGenEnabled
    : !!s?.comfyConfig?.promptGenEnabled
  if (!enabled) return chineseDesc
  return runImagePromptRewrite(chineseDesc)
}
