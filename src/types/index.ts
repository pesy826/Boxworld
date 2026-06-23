// ============ 角色 ============
export interface Character {
  id: string
  name: string
  avatar?: string

  description: string
  personality: string
  scenario: string
  firstMes: string
  mesExample: string
  systemPrompt?: string
  postHistoryInstructions?: string
  alternateGreetings: string[]
  creatorNotes?: string
  tags: string[]

  imFirstMes?: string
  activeLevel: number
  lorebookId?: string
  imPresetId?: string
  scenePresetId?: string

  muted: boolean
  lastTickAt: number

  soloModeEntered: boolean
  soloVirtualTime: number
  soloRealAnchor: number

  // ===== NPC 相关 =====
  /** 是否是 NPC（false=导入的主卡，true=单卡世界内生成的 NPC） */
  isNpc: boolean
  /** NPC 所属的单卡世界（主卡 id）；主卡此字段为 undefined */
  parentWorldId?: string
  /** NPC 与主角/用户的关系简述 */
  npcRelation?: string
  /** 用户在该角色世界里的人设/与用户的关系（替代全局用户人设；NPC 留空则回退所属世界主卡的） */
  userProfile?: string
  /** 是否在通讯录中（好友）。false=仅存在于群聊中的 NPC（加好友后变 true）；undefined 视为 true（旧数据兼容） */
  isContact?: boolean
  /** 角色的私有世界记忆（深思时同步进来的"我该知道但上下文没有"的事件） */
  privateMemory: string
  /**
   * 角色专属「常用表情」：key=情绪槽位名（开心/撒娇/难过/.../随意），value=该槽位下的表情图片(base64)数组。
   * "随意"槽=不好界定使用场景的百搭表情，任何情绪场景都可点缀。
   * 角色发表情时优先（约 6 成概率）从自己的专属表情里按当下情绪挑，其余从通用表情库挑。
   */
  customStickers?: Record<string, string[]>
  /**
   * 我对其他角色的印象/了解（第一人称）。
   * key = 对方角色 id；value = 一句或几句话的印象（如"李四：用户的同事，话不多"）。
   * 全局唯一、不分群（在任何群里对同一个人都用这一份）。
   * 只在深思时随接触慢慢累积；没有记录表示"还不认识/不了解 TA"。
   */
  acquaintances?: Record<string, string>
  createdAt: number
  updatedAt: number
}


/**
 * 角色专属常用表情的预设情绪槽位。最后一个"随意"=不限场景的百搭表情。
 * 用户也可在此基础上自定义新增槽位名。
 */
export const CUSTOM_STICKER_SLOTS = ['开心', '大笑', '撒娇', '害羞', '难过', '生气', '无语', '调侃', '惊讶', '随意'] as const

// ============ 会话 ============
export type ChatType = 'single' | 'group'

export interface Chat {
  id: string
  /** 单聊=对方角色 id；群聊为空字符串 */
  characterId: string
  lastMessageAt: number
  lastMessagePreview: string
  unreadCount: number
  pinned: boolean
  lastCharacterActiveAt: number

  // ===== 群聊相关 =====
  /** 会话类型；旧数据无此字段视为 single */
  type?: ChatType
  /** 群名（type=group 时有效） */
  name?: string
  /** 群成员角色 id 列表（不含用户；type=group 时有效） */
  memberIds?: string[]
  /** 群聊所属的单卡世界主卡 id（在单卡模式下建的群）；全局群为空 */
  worldId?: string
  /**
   * 本群内每个成员的群 ID（类似微信群里各自的群昵称/标识）。
   * key = 角色 id 或 'user'（用户自己）；value = 该成员在此群的群 ID。
   * 群里所有成员互相可见。建群时为角色生成默认值；用户只能改自己的，
   * 角色可在群聊中因关系变化主动改自己的（很有生活感）。
   */
  groupIds?: Record<string, string>

  /** 自定义聊天背景图片（压缩后的 base64 dataURL）；空 = 默认背景。单聊/群聊通用 */
  background?: string
}

// ============ 消息 ============
export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageType =
  | 'text'
  | 'sticker'
  | 'image'
  | 'voice'
  | 'system_notice'
  | 'scene_narrative'


export interface Message {
  id: string
  chatId: string
  sequence: number
  role: MessageRole
  type: MessageType
  content: string
  timestamp: number
  batchId?: string
  sceneHint?: string | null
  mood?: string
  /** 群聊中发言角色的 id（单聊不用；用户消息不用） */
  senderId?: string
  /** type=image 时的图片 dataURL（content 存图片的中文描述） */
  imageData?: string
  /** 文字消息「转语音」后挂在气泡下方的语音条：音频 dataURL（原文本照常显示） */
  voiceData?: string
  /** 语音条时长（秒，向上取整用于显示 N″） */
  voiceDuration?: number
}

// ============ 朋友圈 ============
export type MomentVisibility = 'public' | 'solo'

export interface Moment {
  id: string
  authorId: string
  content: string
  images: string[]
  imageDescriptions: string[]
  imageAnalyzed: boolean
  timestamp: number
  likes: string[]

  // ===== 可见范围 =====
  /** public=全局可见（未锁定的卡都能看）；solo=仅某卡世界可见 */
  visibility: MomentVisibility
  /** visibility=solo 时，属于哪张卡的世界 */
  soloWorldCharacterId?: string
}

export interface MomentComment {
  id: string
  momentId: string
  authorId: string
  replyToId?: string
  content: string
  timestamp: number
}

// ============ 日程 ============
export interface ScheduledEvent {
  id: string
  characterId: string
  title: string
  description?: string
  scheduledAt: number
  location?: string
  isOffline: boolean
  status: 'pending' | 'triggered' | 'cancelled' | 'completed'
  createdAt: number
}

// ============ 记忆 ============
export interface Memory {
  id: string
  characterId: string
  content: string
  importance: number
  timestamp: number
  createdAt: number
}

export interface MomentSummary {
  id: string
  scope: 'user_moments' | 'character_moments'
  ownerId: string
  content: string
  upToTimestamp: number
  createdAt: number
}

export interface SceneSummary {
  id: string
  chatId: string
  content: string
  upToSequence: number
  updatedAt: number
}

/** 单卡世界的统一事件记忆（客观事件流水账） */
export interface WorldSummary {
  id: string                  // 用主卡 id 作为 id，每个世界一份
  worldId: string             // = 主卡 id
  content: string             // 已发生的客观事件汇总
  /** 各角色最后被扫描的消息位置：characterId -> 最后扫描到的 chat 消息 sequence */
  scannedSeq: Record<string, number>
  updatedAt: number
}

// ============ 素材库 ============
/** 表情包（AI 可调用发送） */
export interface Sticker {
  id: string
  /** 描述（即 AI 看到的"表情名"，通常来自文件名） */
  desc: string
  /** base64 图片 */
  image: string
  /** 是否是用户收藏的表情（true=出现在聊天表情面板"我添加的"里；内置库 / AI 用的表情默认 false） */
  favorite?: boolean
  createdAt: number
}

/** 头像库条目（供 NPC 自动分配 / 手动选择） */
export interface AvatarItem {
  id: string
  /** base64 图片 */
  image: string
  /** 标签（如 男 / 女 / 动漫 / 写实），供筛选 */
  tags: string[]
  /** 已被哪个角色使用（空 = 未用） */
  usedBy?: string
  createdAt: number
}

// ============ 世界书 ============
export interface Lorebook {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
}

export type LorebookPosition = 'before_char' | 'after_char' | 'at_depth'
export type LorebookRole = 'system' | 'user'

export interface LorebookEntry {
  id: string
  lorebookId: string
  name: string
  keys: string[]
  content: string
  enabled: boolean
  constant: boolean
  position: LorebookPosition
  role: LorebookRole
  depth: number
  insertionOrder: number
  caseSensitive: boolean
}

// ============ 预设 ============
export type PresetMode = 'im' | 'scene' | 'utility'

export type UtilityType =
  | 'screening'
  | 'thinking'
  | 'scene_summary'
  | 'world_summary'
  | 'npc_generate'
  | 'im_greeting_rewrite'
  | 'moment_generate'
  | 'comment_reply'
  | 'moment_summary'
  | 'image_describe'
  | 'group_chat'
  | 'group_fine'
  | 'group_generate'
  | 'image_prompt_gen'



export type SlotRole =
  | 'static'
  | 'char_description'
  | 'char_personality'
  | 'char_scenario'
  | 'char_mes_example'
  | 'char_system_prompt'
  | 'char_post_history'
  | 'lorebook_before'
  | 'lorebook_after'
  | 'history'
  | 'user_persona'
  | 'jailbreak'
  | 'user_moments'
  | 'character_moments'
  | 'moment_interactions'
  | 'scene_summary'
  | 'private_memory'


export type SlotMessageRole = 'system' | 'user' | 'assistant'

export interface PromptSlot {
  id: string
  name: string
  role: SlotRole
  messageRole: SlotMessageRole
  content: string
  enabled: boolean
}

export interface Preset {
  id: string
  name: string
  mode: PresetMode
  builtin: boolean
  slots: PromptSlot[]
  utilityType?: UtilityType
  createdAt: number
  updatedAt: number
}

// ============ ComfyUI（仅桌面端） ============
/** 模型加载模式：checkpoint=单文件大模型；unet=分离式（UNet + CLIP + VAE） */
export type ComfyModelMode = 'checkpoint' | 'unet'

export interface ComfyConfig {
  /** 是否启用 ComfyUI 文生图 */
  enabled: boolean
  /** ComfyUI 服务地址，如 http://127.0.0.1:8188 */
  baseUrl: string
  /** 模型加载模式（旧数据无此字段视为 checkpoint） */
  modelMode?: ComfyModelMode
  /** Checkpoint 模型文件名（checkpoint 模式用） */
  checkpoint: string
  /** UNet/diffusion 模型文件名（unet 模式用） */
  unetName?: string
  /** UNet 权重精度（unet 模式，UNETLoader 的 weight_dtype） */
  unetWeightDtype?: string
  /** CLIP 模型文件名 1（unet 模式，DualCLIPLoader） */
  clipName1?: string
  /** CLIP 模型文件名 2（unet 模式，DualCLIPLoader；单 CLIP 留空） */
  clipName2?: string
  /** CLIP 类型（unet 模式，DualCLIPLoader 的 type，如 flux/sdxl/sd3） */
  clipType?: string
  /** VAE 模型文件名（unet 模式，VAELoader） */
  vaeName?: string
  width: number
  height: number
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
  /** 负面提示词 */
  negativePrompt: string
  /** 正面提示词固定前缀（如画风 tag），会拼在 AI 给的提示词前面 */
  positivePrefix: string
  /** 正面提示词固定后缀（拼在 AI 给的提示词后面，如质量词 best quality, highly detailed） */
  positiveSuffix?: string
  /** 自定义工作流 JSON（API 格式）。支持占位符 %prompt% %negative% %seed%；留空使用内置 txt2img 工作流 */
  customWorkflow: string
  /** 出图超时（秒） */
  timeoutSec: number
  /**
   * 是否在出图前调用辅助模型把场景描述改写成规范的文生图提示词。
   * 开启后用 image_prompt_gen utility 预设（可在预设页编辑）改写——
   * 可针对不同 SD 模型偏好（自然语言 / tag）和侧重点（人物 / 场景）定制。
   */
  promptGenEnabled?: boolean
}

// ============ NAI 生图（NovelAI Image Generation） ============
/**
 * NovelAI 官方图像生成配置。与 ComfyUI 平级的另一个出图后端。
 * 调用 NovelAI 的 /ai/generate-image 接口（返回 zip，内含 PNG），用 API Key 鉴权。
 * 跨域：桌面端走 Tauri http 插件最稳；浏览器/移动端需中转。
 */
export interface NaiConfig {
  /** 是否启用 */
  enabled: boolean
  /** NovelAI API Key（持久 token） */
  apiKey: string
  /** 接口地址（默认 https://image.novelai.net），可填中转 */
  baseUrl: string
  /** 模型，如 nai-diffusion-4-5-full / nai-diffusion-3 */
  model: string
  width: number
  height: number
  /** 采样步数 */
  steps: number
  /** 提示词引导强度（cfg scale） */
  scale: number
  /** 采样器，如 k_euler_ancestral / k_dpmpp_2m */
  sampler: string
  /** 负面提示词（undesired content） */
  negativePrompt: string
  /** 正面提示词固定前缀（拼在 AI 提示词前，如画风 tag） */
  positivePrefix: string
  /** 正面提示词固定后缀 */
  positiveSuffix: string
  /** 出图超时（秒） */
  timeoutSec: number
  /**
   * 是否在出图前用辅助模型把中文描述改写成规范英文提示词（复用 image_prompt_gen 预设）。
   */
  promptGenEnabled?: boolean
}

/** 角色发图用哪个后端：comfy=本地 ComfyUI（仅桌面端）；nai=NovelAI 官方（不限平台） */
export type ImageBackend = 'comfy' | 'nai'

// ============ 语音通话 ============
/** 语音端点来源：primary=主模型端点、utility=辅助端点、custom=下方独立端点 */
export type VoiceEndpointSource = 'primary' | 'utility' | 'custom'

export interface VoiceConfig {
  /** 是否启用语音通话 */
  enabled: boolean
  /** STT 模型（语音转文字），默认 whisper-1 */
  sttModel: string
  /** TTS 模型（文字转语音），默认 gpt-4o-mini-tts / tts-1 */
  ttsModel: string
  /** TTS 音色，默认 alloy */
  ttsVoice: string
  /**
   * 语音（STT/TTS）用哪个端点。
   * - 'custom'（推荐）：用下方独立的 voiceBaseUrl/voiceApiKey（支持语音的模型常和文字模型不在同一服务）
   * - 'utility'：辅助端点
   * - 'primary'（默认旧值）：主端点
   * 旧数据只有 useUtilityEndpoint 布尔，迁移时换算。
   */
  endpointSource?: VoiceEndpointSource
  /** 独立语音端点 Base URL（endpointSource='custom' 时用） */
  voiceBaseUrl?: string
  /** 独立语音端点 API Key（endpointSource='custom' 时用） */
  voiceApiKey?: string
  /** 旧字段（兼容）：STT/TTS 是否走辅助端点 */
  useUtilityEndpoint?: boolean
  /** 是否启用 VAD 自动断句（默认 true） */
  vadEnabled?: boolean
  /** VAD 静音多少毫秒判定一句话结束（默认 800） */
  vadSilenceMs?: number
  /** STT 语言提示（如 'zh'；留空让模型自动识别） */
  sttLanguage?: string
}

// ============ API ============
export interface ApiEndpoint {
  baseUrl: string
  apiKey: string
  model: string
  /**
   * 该模型是否支持识图（vision / 多模态）。
   * 仅主模型用：开启时聊天里的图片以 OpenAI image_url 多模态直喂给模型；
   * 关闭（默认）时图片降级成文字 [图片：描述] 喂入，避免不支持的模型报 400。
   */
  vision?: boolean
}

export interface ApiConfig {
  primary: ApiEndpoint
  utility: ApiEndpoint

  temperature: number
  maxTokens: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  seed: number
  stream: boolean
  contextSize: number
}

// ============ 补算 ============
export interface TickConfig {
  cooldownMinutes: number
  maxConcurrency: number
  startupTickEnabled: boolean
  startupMinIntervalHours: number
  momentSummaryEnabled: boolean
  momentSummaryThreshold: number
  autoTickOnPage: boolean
}

// ============ 聊天节奏 ============
export interface ChatBehaviorConfig {
  userIdleMs: number
  assistantThinkingMs: number
  assistantTypingMsPerChar: number
  assistantMinPauseMs: number
  assistantMaxPauseMs: number
}

/**
 * 群聊扮演模式：
 * - coarse（粗略）：一次 API 调用让模型同时扮演所有成员，输出整批消息（省钱、默认）
 * - fine（精细）：多轮调用，每轮 AI 先判断该谁发言再只扮演 1~少数角色，更自然但开销高
 */
export type GroupChatMode = 'coarse' | 'fine'

// ============ 用户 / 时间 ============
export interface UserPersona {
  name: string
  avatar?: string
  /** 用户人设描述（供 {{persona}} 宏使用） */
  description?: string
}

export interface VirtualTimeState {
  virtualNow: number
  realAnchor: number
  timeScale: number
  paused: boolean
}

// ============ 设置 ============
export interface Settings {
  id: 'singleton'
  apiConfig: ApiConfig
  userPersona: UserPersona
  virtualTime: VirtualTimeState
  tickConfig: TickConfig
  chatBehavior: ChatBehaviorConfig
  utilityPresetMap: Partial<Record<UtilityType, string>>
  /** 当前进入的单卡模式角色 id；空 = 全局模式 */
  activeSoloCharacterId?: string
  defaultImPresetId?: string
  defaultScenePresetId?: string
  /** ComfyUI 文生图配置（仅桌面端生效；旧数据可能没有此字段） */
  comfyConfig?: ComfyConfig
  /** NAI（NovelAI）生图配置（旧数据可能没有此字段） */
  naiConfig?: NaiConfig
  /** 角色发图用哪个后端（旧数据无此字段视为 comfy） */
  imageBackend?: ImageBackend
  /** 界面主题（旧数据无此字段视为 system 跟随系统） */
  theme?: 'light' | 'dark' | 'system'
  /** 群聊扮演模式（旧数据无此字段视为 coarse 粗略） */
  groupChatMode?: GroupChatMode
  /** 群聊精细模式单次最多跑多少轮（默认 6）。轮数越多角色之间越能自己聊起来，但 API 开销越大 */
  groupFineMaxRounds?: number
  /**
   * 群聊里给每个成员注入「TA 与你的私聊近况」取最近多少条消息。
   * 0 或未设置 = 全部（默认）；设为正数则只取最近 N 条，省 token。
   */
  groupMemberPrivateChatRecent?: number
  /** 语音通话配置（旧数据可能没有此字段） */
  voiceConfig?: VoiceConfig
}

// ============ 补算日志 ============
export type TickLogStage = 'heuristic' | 'screen' | 'decide' | 'apply' | 'summary'
export type TickLogResult = 'skipped' | 'pass' | 'fail' | 'success'

export interface TickLogEntry {
  id: string
  runId: string
  stage: TickLogStage
  result: TickLogResult
  characterId?: string
  characterName?: string
  reason?: string
  detail?: string
  timestamp: number
}
