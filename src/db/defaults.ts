import type { Settings, ComfyConfig, VoiceConfig, NaiConfig } from '../types'

export function createDefaultNaiConfig(): NaiConfig {
  return {
    enabled: false,
    apiKey: '',
    baseUrl: 'https://image.novelai.net',
    model: 'nai-diffusion-4-5-full',
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5,
    sampler: 'k_euler_ancestral',
    negativePrompt: 'lowres, worst quality, bad anatomy, bad hands, text, error, watermark, blurry',
    positivePrefix: '',
    positiveSuffix: '',
    timeoutSec: 120,
    promptGenEnabled: false,
  }
}

export function createDefaultVoiceConfig(): VoiceConfig {
  return {
    enabled: false,
    sttModel: 'whisper-1',
    ttsModel: 'tts-1',
    ttsVoice: 'alloy',
    useUtilityEndpoint: false,
    vadEnabled: true,
    vadSilenceMs: 800,
    sttLanguage: 'zh',
  }
}

export function createDefaultComfyConfig(): ComfyConfig {
  return {
    enabled: false,
    baseUrl: 'http://127.0.0.1:8188',
    modelMode: 'checkpoint',
    checkpoint: '',
    unetName: '',
    unetWeightDtype: 'default',
    clipName1: '',
    clipName2: '',
    clipType: 'stable_diffusion',
    vaeName: '',
    width: 768,
    height: 768,
    steps: 25,
    cfg: 7,
    samplerName: 'euler',
    scheduler: 'normal',
    negativePrompt: 'lowres, bad anatomy, bad hands, text, error, watermark, blurry',
    positivePrefix: '',
    positiveSuffix: '',
    customWorkflow: '',
    timeoutSec: 180,
    promptGenEnabled: false,
  }
}

export function createDefaultSettings(): Settings {
  const now = Date.now()
  return {
    id: 'singleton',
    apiConfig: {
      primary: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' },
      utility: { baseUrl: '', apiKey: '', model: '' },
      temperature: 0.8,
      maxTokens: 2048,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      seed: -1,
      stream: true,
      contextSize: 32000,
    },
    userPersona: { name: '我' },
    virtualTime: { virtualNow: now, realAnchor: now, timeScale: 1, paused: false },
    tickConfig: {
      cooldownMinutes: 30,
      maxConcurrency: 3,
      startupTickEnabled: true,
      startupMinIntervalHours: 2,
      momentSummaryEnabled: false,
      momentSummaryThreshold: 30,
      autoTickOnPage: true,
    },
    chatBehavior: {
      userIdleMs: 3000,
      assistantThinkingMs: 1500,
      assistantTypingMsPerChar: 80,
      assistantMinPauseMs: 600,
      assistantMaxPauseMs: 4000,
    },
    utilityPresetMap: {
      screening: 'builtin-util-screening',
      thinking: 'builtin-util-thinking',
      scene_summary: 'builtin-util-scene-summary',
      npc_generate: 'builtin-util-npc-generate',
      im_greeting_rewrite: 'builtin-util-im-rewrite',
      moment_generate: 'builtin-util-moment-gen',
      comment_reply: 'builtin-util-comment-reply',
      moment_summary: 'builtin-util-moment-summary',
      image_describe: 'builtin-util-image-describe',
      world_summary: 'builtin-util-world-summary',
      group_chat: 'builtin-util-group-chat',
      group_fine: 'builtin-util-group-fine',
      group_generate: 'builtin-util-group-generate',
      image_prompt_gen: 'builtin-util-image-prompt-gen',
    },

    groupChatMode: 'coarse',
    groupFineMaxRounds: 6,
    activeSoloCharacterId: undefined,
    comfyConfig: createDefaultComfyConfig(),
    naiConfig: createDefaultNaiConfig(),
    imageBackend: 'comfy',
    theme: 'system',
    voiceConfig: createDefaultVoiceConfig(),
  }
}
