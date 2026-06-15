import { useState, useRef } from 'react'
import { Camera } from 'lucide-react'
import Avatar from '../components/Avatar'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { testApiConnection, fetchModelList, transcribeAudio, synthesizeSpeech } from '../services/apiService'
import { testComfyConnection, fetchComfyCheckpoints, fetchComfyUnetModels, fetchComfySamplers, generateComfyImage } from '../services/comfyService'
import { createDefaultComfyConfig, createDefaultVoiceConfig } from '../db/defaults'
import { isDesktop } from '../utils/platform'
import { SettingRow, SettingSection } from '../components/SettingRow'
import { SafeInput } from '../components/SafeInput'
import { usePageTour } from '../components/TourOverlay'
import { settingsTour } from '../components/tours'
import { useTourStore } from '../stores/tourStore'
import type { ApiEndpoint } from '../types'

export default function SettingsPage() {
  const navigate = useNavigate()
  const settings = useSettingsStore((s) => s.settings)
  const updateApiConfig = useSettingsStore((s) => s.updateApiConfig)
  const updateApiEndpoint = useSettingsStore((s) => s.updateApiEndpoint)
  const updateUserPersona = useSettingsStore((s) => s.updateUserPersona)
  const updateTickConfig = useSettingsStore((s) => s.updateTickConfig)
  const updateChatBehavior = useSettingsStore((s) => s.updateChatBehavior)

  const [showAdvanced, setShowAdvanced] = useState(false)
  usePageTour(settingsTour)

  if (!settings) return null
  const { apiConfig, userPersona, tickConfig, chatBehavior } = settings

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center pr-8">设置</h1>
      </header>

      <div data-tour="api-primary">
        <EndpointSection
          title="主模型（对话、生成）"
          hint="用于正式对话和朋友圈内容生成。请使用质量较好的模型。"
          endpoint={apiConfig.primary}
          onChange={(patch) => updateApiEndpoint('primary', patch)}
          showVision
        />
      </div>

      <div data-tour="api-utility">
        <EndpointSection
          title="辅助模型（决策、摘要）"
          hint="用于补算粗筛、摘要等内部任务。可用较便宜的模型；留空则回退到主模型。"
          endpoint={apiConfig.utility}
          onChange={(patch) => updateApiEndpoint('utility', patch)}
        />
      </div>

      <SettingSection title="生成参数（主辅共用）">
        <SettingRow label="Temperature" hint="0-2，控制随机性">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="0.1" min="0" max="2"
            value={apiConfig.temperature}
            onChange={(e) => updateApiConfig({ temperature: parseFloat(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="Max Tokens" hint="单次回复最大长度">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="128" min="64"
            value={apiConfig.maxTokens}
            onChange={(e) => updateApiConfig({ maxTokens: parseInt(e.target.value) || 1024 })}
          />
        </SettingRow>
        <SettingRow label="上下文长度">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="1000" min="1000"
            value={apiConfig.contextSize}
            onChange={(e) => updateApiConfig({ contextSize: parseInt(e.target.value) || 8000 })}
          />
        </SettingRow>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-3 text-[14px] text-wechat-textGray text-left hover:bg-wechat-bg"
        >
          {showAdvanced ? '▼ 高级参数' : '▶ 高级参数'}
        </button>

        {showAdvanced && (
          <>
            <SettingRow label="Top P">
              <input
                className="w-full text-[14px] text-right outline-none bg-transparent"
                type="number" step="0.05" min="0" max="1"
                value={apiConfig.topP}
                onChange={(e) => updateApiConfig({ topP: parseFloat(e.target.value) || 1 })}
              />
            </SettingRow>
            <SettingRow label="频率惩罚">
              <input
                className="w-full text-[14px] text-right outline-none bg-transparent"
                type="number" step="0.1" min="-2" max="2"
                value={apiConfig.frequencyPenalty}
                onChange={(e) => updateApiConfig({ frequencyPenalty: parseFloat(e.target.value) || 0 })}
              />
            </SettingRow>
            <SettingRow label="存在惩罚">
              <input
                className="w-full text-[14px] text-right outline-none bg-transparent"
                type="number" step="0.1" min="-2" max="2"
                value={apiConfig.presencePenalty}
                onChange={(e) => updateApiConfig({ presencePenalty: parseFloat(e.target.value) || 0 })}
              />
            </SettingRow>
            <SettingRow label="随机种子" hint="-1 = 随机">
              <input
                className="w-full text-[14px] text-right outline-none bg-transparent"
                type="number" step="1"
                value={apiConfig.seed}
                onChange={(e) => updateApiConfig({ seed: parseInt(e.target.value) || -1 })}
              />
            </SettingRow>
          </>
        )}
      </SettingSection>

      <SettingSection title="聊天节奏">
        <SettingRow label="用户停止输入等待（毫秒）" hint="发出消息后等多久才让 AI 回复，让你有机会连发">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="500" min="0"
            value={chatBehavior.userIdleMs}
            onChange={(e) => updateChatBehavior({ userIdleMs: parseInt(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="角色思考延迟（毫秒）" hint="收到 API 回复后等多久开始显示第一条消息">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="100" min="0"
            value={chatBehavior.assistantThinkingMs}
            onChange={(e) => updateChatBehavior({ assistantThinkingMs: parseInt(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="角色打字速度（毫秒/字符）" hint="数字越大打字越慢">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="10" min="0"
            value={chatBehavior.assistantTypingMsPerChar}
            onChange={(e) => updateChatBehavior({ assistantTypingMsPerChar: parseInt(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="消息间最小停顿（毫秒）">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="100" min="0"
            value={chatBehavior.assistantMinPauseMs}
            onChange={(e) => updateChatBehavior({ assistantMinPauseMs: parseInt(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="消息间最大停顿（毫秒）">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="500" min="500"
            value={chatBehavior.assistantMaxPauseMs}
            onChange={(e) => updateChatBehavior({ assistantMaxPauseMs: parseInt(e.target.value) || 500 })}
          />
        </SettingRow>
      </SettingSection>

      <div data-tour="tick-section">
      <SettingSection title="角色补算">
        <SettingRow label="冷却时间（虚拟分钟）" hint="同一角色多久内不重复补算">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="5" min="0"
            value={tickConfig.cooldownMinutes}
            onChange={(e) => updateTickConfig({ cooldownMinutes: parseInt(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="并发上限" hint="同时处理多少角色">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="1" min="1" max="10"
            value={tickConfig.maxConcurrency}
            onChange={(e) => updateTickConfig({ maxConcurrency: parseInt(e.target.value) || 3 })}
          />
        </SettingRow>
        <SettingRow label="启动时补算">
          <input
            type="checkbox"
            checked={tickConfig.startupTickEnabled}
            onChange={(e) => updateTickConfig({ startupTickEnabled: e.target.checked })}
            className="w-5 h-5 accent-wechat-green"
          />
        </SettingRow>
        <SettingRow label="启动补算最小间隔（虚拟小时）" hint="少于此时间不触发">
          <input
            className="w-full text-[14px] text-right outline-none bg-transparent"
            type="number" step="0.5" min="0"
            value={tickConfig.startupMinIntervalHours}
            onChange={(e) => updateTickConfig({ startupMinIntervalHours: parseFloat(e.target.value) || 0 })}
          />
        </SettingRow>
        <SettingRow label="进入相关页面时自动补算" hint="进朋友圈或聊天列表时触发">
          <input
            type="checkbox"
            checked={tickConfig.autoTickOnPage}
            onChange={(e) => updateTickConfig({ autoTickOnPage: e.target.checked })}
            className="w-5 h-5 accent-wechat-green"
          />
        </SettingRow>
        <SettingRow label="启用朋友圈摘要" hint="将老朋友圈压缩成摘要节省 token">
          <input
            type="checkbox"
            checked={tickConfig.momentSummaryEnabled}
            onChange={(e) => updateTickConfig({ momentSummaryEnabled: e.target.checked })}
            className="w-5 h-5 accent-wechat-green"
          />
        </SettingRow>
        {tickConfig.momentSummaryEnabled && (
          <SettingRow label="摘要触发阈值" hint="朋友圈超过该数量时压缩">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="5" min="10"
              value={tickConfig.momentSummaryThreshold}
              onChange={(e) => updateTickConfig({ momentSummaryThreshold: parseInt(e.target.value) || 30 })}
            />
          </SettingRow>
        )}
      </SettingSection>
      </div>

      <GroupChatModeSection />

      <VoiceSection />

      {isDesktop() && <ComfySection />}

      <SettingSection title={'我的人设（角色眼中的"你"）'}>
        <UserAvatarRow />
        <SettingRow label="昵称">
          <SafeInput
            className="w-full text-[14px] text-right outline-none bg-transparent"
            value={userPersona.name}
            placeholder="我"
            onChange={(v) => updateUserPersona({ name: v })}
          />
        </SettingRow>
      </SettingSection>


      <SettingSection title="数据">
        <SettingRow label="新手指引" hint="重新开启所有页面的首次进入教程">
          <button
            className="text-[14px] text-wechat-green"
            onClick={() => {
              useTourStore.getState().resetAll()
              alert('已重置，再次进入各页面时将重新显示指引')
            }}
          >
            重置指引
          </button>
        </SettingRow>
        <DataManageRows />
        <SettingRow label="清空全部数据" hint="不可恢复，慎用">
          <button
            className="text-[14px] text-red-500"
            onClick={async () => {
              if (!confirm('确定清空全部数据？此操作不可恢复。')) return
              indexedDB.deleteDatabase('BoxWorldDB')
              alert('已清空，页面将刷新')
              location.reload()
            }}
          >
            清空
          </button>
        </SettingRow>
      </SettingSection>


      <div className="h-8" />
    </div>
  )
}

function EndpointSection({
  title, hint, endpoint, onChange, showVision,
}: {
  title: string
  hint: string
  endpoint: ApiEndpoint
  onChange: (patch: Partial<ApiEndpoint>) => void
  /** 是否显示"读图（vision）"开关（仅主模型用） */
  showVision?: boolean
}) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelError, setModelError] = useState<string | null>(null)

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    const r = await testApiConnection(endpoint)
    setTesting(false)
    setTestResult(r.ok ? `✓ 连接成功：${r.reply}` : `✗ ${r.error}`)
  }

  const handleFetchModels = async () => {
    setLoadingModels(true); setModelError(null)
    const r = await fetchModelList(endpoint)
    setLoadingModels(false)
    if (r.ok) {
      setModels(r.models)
      if (!endpoint.model && r.models[0]) onChange({ model: r.models[0] })
    } else {
      setModelError(r.error)
    }
  }

  const inputCls = 'w-full text-[14px] text-right outline-none bg-transparent placeholder:text-wechat-textGray'

  return (
    <SettingSection title={title}>
      <div className="px-4 pt-2 pb-1 text-[11px] text-wechat-textGray">{hint}</div>
      <SettingRow label="Base URL">
        <SafeInput
          className={inputCls}
          value={endpoint.baseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(v) => onChange({ baseUrl: v })}
        />
      </SettingRow>
      <SettingRow label="API Key">
        <SafeInput
          className={inputCls}
          type="password"
          value={endpoint.apiKey}
          placeholder="sk-..."
          onChange={(v) => onChange({ apiKey: v })}
        />
      </SettingRow>
      <SettingRow label="模型">
        <div className="flex items-center gap-2 justify-end w-full">
          {models.length > 0 ? (
            <select
              className="text-[14px] bg-transparent outline-none max-w-[200px]"
              value={endpoint.model}
              onChange={(e) => onChange({ model: e.target.value })}
            >
              <option value="">请选择...</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <SafeInput
              className={inputCls}
              value={endpoint.model}
              placeholder="点右侧按钮拉取"
              onChange={(v) => onChange({ model: v })}
            />
          )}
          <button onClick={handleFetchModels} disabled={loadingModels} className="p-1.5 rounded hover:bg-wechat-bg shrink-0">
            {loadingModels
              ? <Loader2 size={16} className="animate-spin text-wechat-textGray" />
              : <RefreshCw size={16} className="text-wechat-green" />}
          </button>
        </div>
      </SettingRow>
      {modelError && (
        <div className="px-4 pb-2 text-[12px] text-red-500">{modelError}</div>
      )}

      {showVision && (
        <>
          <SettingRow label="读图（识别图片）">
            <button
              onClick={() => onChange({ vision: !endpoint.vision })}
              className={`relative w-11 h-6 rounded-full transition-colors ${endpoint.vision ? 'bg-wechat-green' : 'bg-gray-300'}`}
              aria-label="切换读图"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${endpoint.vision ? 'translate-x-5' : ''}`} />
            </button>
          </SettingRow>
          <div className="px-4 pb-2 text-[11px] text-wechat-textGray">
            开启后聊天里用户发的图片会直接以图像喂给模型（需模型支持识图，如 gpt-4o、Claude、Gemini）。模型不支持识图就关闭——图片会降级为文字占位，避免报 400 错误。
          </div>
        </>
      )}

      <div className="px-4 py-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="w-full py-2 bg-wechat-green text-white rounded text-[13px] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {testing && <Loader2 size={14} className="animate-spin" />}
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult && (
          <div className={`mt-2 text-[12px] px-2 py-1.5 rounded ${testResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
            {testResult}
          </div>
        )}
      </div>
    </SettingSection>
  )
}

function GroupChatModeSection() {
  const settings = useSettingsStore((s) => s.settings)
  const setGroupChatMode = useSettingsStore((s) => s.setGroupChatMode)
  const setGroupFineMaxRounds = useSettingsStore((s) => s.setGroupFineMaxRounds)
  const setGroupMemberPrivateChatRecent = useSettingsStore((s) => s.setGroupMemberPrivateChatRecent)
  if (!settings) return null
  const mode = settings.groupChatMode || 'coarse'
  const maxRounds = settings.groupFineMaxRounds ?? 6
  const privateChatRecent = settings.groupMemberPrivateChatRecent ?? 0
  return (
    <SettingSection title="群聊模式">
      <div className="px-4 pt-2 pb-1 text-[11px] text-wechat-textGray">
        粗略：一次调用让模型同时扮演所有成员，省 token（默认）。精细：多轮调用，每轮只让少数最该接话的角色发言，角色之间也能自己聊起来，更自然但开销更高。
      </div>
      <SettingRow label="扮演模式">
        <select
          className="text-[14px] bg-transparent outline-none"
          value={mode}
          onChange={(e) => setGroupChatMode(e.target.value as any)}
        >
          <option value="coarse">粗略（省钱，默认）</option>
          <option value="fine">精细（更自然，开销高）</option>
        </select>
      </SettingRow>
      {mode === 'fine' && (
        <>
          <SettingRow label="精细模式轮数上限" hint="一次触发里 AI 角色之间最多自动聊几轮。越大越能聊开，但 API 开销越大">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="1" min="1" max="30"
              value={maxRounds}
              onChange={(e) => setGroupFineMaxRounds(parseInt(e.target.value) || 6)}
            />
          </SettingRow>
        </>
      )}
      <SettingRow label="群里注入成员私聊条数" hint="群聊时给每个成员注入 TA 与你的私聊近况，取最近多少条。0 = 全部（默认，最连贯）；设为正数可省 token">
        <input
          className="w-full text-[14px] text-right outline-none bg-transparent"
          type="number" step="10" min="0" max="200"
          value={privateChatRecent}
          onChange={(e) => setGroupMemberPrivateChatRecent(parseInt(e.target.value) || 0)}
        />
      </SettingRow>
    </SettingSection>
  )
}

function VoiceSection() {
  const settings = useSettingsStore((s) => s.settings)
  const updateVoiceConfig = useSettingsStore((s) => s.updateVoiceConfig)

  const [sttTesting, setSttTesting] = useState(false)
  const [sttResult, setSttResult] = useState<string | null>(null)
  const [ttsTesting, setTtsTesting] = useState(false)
  const [ttsResult, setTtsResult] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelError, setModelError] = useState<string | null>(null)

  if (!settings) return null
  const cfg = settings.voiceConfig || createDefaultVoiceConfig()
  const source = cfg.endpointSource ?? (cfg.useUtilityEndpoint ? 'utility' : 'primary')
  const inputCls = 'w-full text-[14px] text-right outline-none bg-transparent placeholder:text-wechat-textGray'

  // 取语音端点（baseUrl + apiKey；模型走 voiceConfig 自己的字段）
  const pickEndpoint = (): { baseUrl: string; apiKey: string } | null => {
    if (source === 'custom') {
      if (cfg.voiceBaseUrl && cfg.voiceApiKey) return { baseUrl: cfg.voiceBaseUrl, apiKey: cfg.voiceApiKey }
    } else if (source === 'utility') {
      const u = settings.apiConfig.utility
      if (u.apiKey && u.baseUrl) return u
    }
    const p = settings.apiConfig.primary
    if (p.apiKey && p.baseUrl) return p
    return null
  }

  const handleFetchModels = async () => {
    setLoadingModels(true); setModelError(null)
    const ep = pickEndpoint()
    if (!ep) { setLoadingModels(false); setModelError('请先填好语音端点 Base URL 和 API Key'); return }
    const r = await fetchModelList(ep)
    setLoadingModels(false)
    if (r.ok) setModels(r.models)
    else setModelError(r.error)
  }

  const handleTestStt = async () => {
    setSttResult(null)
    const ep = pickEndpoint()
    if (!ep) { setSttResult('✗ 未配置可用的语音端点'); return }
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e: any) {
      setSttResult('✗ 无法获取麦克风：' + (e?.message || e))
      return
    }
    setRecording(true)
    setSttTesting(true)
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'audio/webm' }))
      })
      rec.start()
      await new Promise((r) => setTimeout(r, 2500))
      rec.stop()
      setRecording(false)
      const blob = await done
      const r = await transcribeAudio({ ...ep, model: cfg.sttModel }, blob, { model: cfg.sttModel, language: cfg.sttLanguage })
      setSttResult(r.ok ? `✓ 识别结果：${r.text || '(空)'}` : `✗ ${r.error}`)
    } catch (e: any) {
      setSttResult('✗ ' + (e?.message || e))
    } finally {
      setRecording(false)
      setSttTesting(false)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }

  const handleTestTts = async () => {
    setTtsResult(null)
    const ep = pickEndpoint()
    if (!ep) { setTtsResult('✗ 未配置可用的语音端点'); return }
    setTtsTesting(true)
    try {
      const r = await synthesizeSpeech({ ...ep, model: cfg.ttsModel }, '你好，这是一条语音测试。', { model: cfg.ttsModel, voice: cfg.ttsVoice })
      if (!r.ok) { setTtsResult(`✗ ${r.error}`); return }
      const url = URL.createObjectURL(r.blob)
      const audio = new Audio(url)
      await audio.play().catch(() => {})
      audio.onended = () => URL.revokeObjectURL(url)
      setTtsResult('✓ 合成成功，正在播放')
    } catch (e: any) {
      setTtsResult('✗ ' + (e?.message || e))
    } finally {
      setTtsTesting(false)
    }
  }

  // 模型输入：有拉取到列表则下拉选，否则手填
  const ModelField = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    models.length > 0 ? (
      <select
        className="text-[14px] bg-transparent outline-none max-w-[200px]"
        value={models.includes(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {!models.includes(value) && <option value="">{value || '请选择...'}</option>}
        {models.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    ) : (
      <SafeInput className={inputCls} value={value} placeholder={placeholder} onChange={onChange} />
    )
  )

  return (
    <SettingSection title="语音通话">
      <div className="px-4 pt-2 pb-1 text-[11px] text-wechat-textGray">
        启用后可在聊天「+」面板里发起语音通话。语音端点需提供 /audio/transcriptions（识别）和 /audio/speech（合成）接口——支持语音的模型常与文字模型不在同一服务，建议单独填一个语音端点。
      </div>
      <SettingRow label="启用">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => updateVoiceConfig({ enabled: e.target.checked })}
          className="w-5 h-5 accent-wechat-green"
        />
      </SettingRow>

      <SettingRow label="语音端点来源">
        <select
          className="text-[14px] bg-transparent outline-none"
          value={source}
          onChange={(e) => { updateVoiceConfig({ endpointSource: e.target.value as any }); setModels([]); setModelError(null) }}
        >
          <option value="custom">独立语音端点（推荐）</option>
          <option value="primary">跟随主模型端点</option>
          <option value="utility">跟随辅助模型端点</option>
        </select>
      </SettingRow>

      {source === 'custom' && (
        <>
          <SettingRow label="语音 Base URL">
            <SafeInput
              className={inputCls}
              value={cfg.voiceBaseUrl || ''}
              placeholder="https://语音服务/v1"
              onChange={(v) => updateVoiceConfig({ voiceBaseUrl: v })}
            />
          </SettingRow>
          <SettingRow label="语音 API Key">
            <SafeInput
              className={inputCls}
              type="password"
              value={cfg.voiceApiKey || ''}
              placeholder="sk-..."
              onChange={(v) => updateVoiceConfig({ voiceApiKey: v })}
            />
          </SettingRow>
        </>
      )}

      <div className="px-4 pt-1 flex justify-end">
        <button onClick={handleFetchModels} disabled={loadingModels} className="text-[12px] text-wechat-green flex items-center gap-1">
          {loadingModels ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          拉取模型列表
        </button>
      </div>
      {modelError && <div className="px-4 pb-1 text-[12px] text-red-500">{modelError}</div>}

      <SettingRow label="STT 模型" hint="语音转文字，如 whisper-1">
        <ModelField value={cfg.sttModel} placeholder="whisper-1" onChange={(v) => updateVoiceConfig({ sttModel: v })} />
      </SettingRow>
      <SettingRow label="TTS 模型" hint="文字转语音，如 tts-1 / gpt-4o-mini-tts">
        <ModelField value={cfg.ttsModel} placeholder="tts-1" onChange={(v) => updateVoiceConfig({ ttsModel: v })} />
      </SettingRow>
      <SettingRow label="TTS 音色" hint="如 alloy / echo / fable / nova / shimmer">
        <SafeInput
          className={inputCls}
          value={cfg.ttsVoice}
          placeholder="alloy"
          onChange={(v) => updateVoiceConfig({ ttsVoice: v })}
        />
      </SettingRow>
      <SettingRow label="STT 语言" hint="如 zh（留空让模型自动识别）">
        <SafeInput
          className={inputCls}
          value={cfg.sttLanguage || ''}
          placeholder="zh"
          onChange={(v) => updateVoiceConfig({ sttLanguage: v })}
        />
      </SettingRow>
      <SettingRow label="自动断句 (VAD)" hint="检测到停顿就自动结束本句，免按住说话">
        <input
          type="checkbox"
          checked={cfg.vadEnabled !== false}
          onChange={(e) => updateVoiceConfig({ vadEnabled: e.target.checked })}
          className="w-5 h-5 accent-wechat-green"
        />
      </SettingRow>
      <SettingRow label="VAD 静音判定（毫秒）" hint="停顿多久算说完一句">
        <input
          className="w-full text-[14px] text-right outline-none bg-transparent"
          type="number" step="100" min="300"
          value={cfg.vadSilenceMs ?? 800}
          onChange={(e) => updateVoiceConfig({ vadSilenceMs: parseInt(e.target.value) || 800 })}
        />
      </SettingRow>

      <div className="px-4 py-2 flex gap-2">
        <button
          onClick={handleTestStt}
          disabled={sttTesting}
          className="flex-1 py-2 bg-wechat-green text-white rounded text-[13px] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {sttTesting && <Loader2 size={14} className="animate-spin" />}
          {recording ? '录音中(2.5s)...' : sttTesting ? '识别中...' : '测试 STT（录音）'}
        </button>
        <button
          onClick={handleTestTts}
          disabled={ttsTesting}
          className="flex-1 py-2 border border-wechat-green text-wechat-green rounded text-[13px] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {ttsTesting && <Loader2 size={14} className="animate-spin" />}
          {ttsTesting ? '合成中...' : '测试 TTS（播放）'}
        </button>
      </div>
      {sttResult && (
        <div className={`mx-4 mb-2 text-[12px] px-2 py-1.5 rounded ${sttResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {sttResult}
        </div>
      )}
      {ttsResult && (
        <div className={`mx-4 mb-2 text-[12px] px-2 py-1.5 rounded ${ttsResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {ttsResult}
        </div>
      )}
    </SettingSection>
  )
}

function ComfySection() {
  const settings = useSettingsStore((s) => s.settings)
  const updateComfyConfig = useSettingsStore((s) => s.updateComfyConfig)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelError, setModelError] = useState<string | null>(null)
  const [unetModels, setUnetModels] = useState<{ unet: string[]; clip: string[]; vae: string[]; weightDtypes: string[]; clipTypes: string[] }>(
    { unet: [], clip: [], vae: [], weightDtypes: [], clipTypes: [] },
  )
  const [samplers, setSamplers] = useState<string[]>([])
  const [schedulers, setSchedulers] = useState<string[]>([])
  const [genTesting, setGenTesting] = useState(false)
  const [genResult, setGenResult] = useState<{ ok: boolean; text: string; image?: string } | null>(null)

  if (!settings) return null
  const cfg = settings.comfyConfig || createDefaultComfyConfig()
  const mode = cfg.modelMode || 'checkpoint'
  const inputCls = 'w-full text-[14px] text-right outline-none bg-transparent placeholder:text-wechat-textGray'

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    const r = await testComfyConnection(cfg)
    setTesting(false)
    setTestResult(r.ok ? `✓ 连接成功：${r.info}` : `✗ ${r.error}`)
  }

  // 拉取采样器/调度器枚举（与拉取模型一起触发，失败不阻塞）
  const fetchSamplers = async () => {
    const r = await fetchComfySamplers(cfg)
    if (r.ok) {
      setSamplers(r.samplers)
      setSchedulers(r.schedulers)
    }
  }

  const handleFetchModels = async () => {
    setLoadingModels(true); setModelError(null)
    fetchSamplers()
    if (mode === 'unet') {
      const r = await fetchComfyUnetModels(cfg)
      setLoadingModels(false)
      if (r.ok) {
        setUnetModels({ unet: r.unet, clip: r.clip, vae: r.vae, weightDtypes: r.weightDtypes, clipTypes: r.clipTypes })
        const patch: any = {}
        if (!cfg.unetName && r.unet[0]) patch.unetName = r.unet[0]
        if (!cfg.clipName1 && r.clip[0]) patch.clipName1 = r.clip[0]
        if (!cfg.vaeName && r.vae[0]) patch.vaeName = r.vae[0]
        if (Object.keys(patch).length) updateComfyConfig(patch)
        if (r.unet.length === 0) setModelError('未找到 UNet 模型（确认 models/unet 或 models/diffusion_models 有文件）')
      } else {
        setModelError(r.error || '拉取失败')
      }
    } else {
      const r = await fetchComfyCheckpoints(cfg)
      setLoadingModels(false)
      if (r.ok) {
        setModels(r.models)
        if (r.models.length === 0) setModelError('未找到任何 checkpoint 模型')
        else if (!cfg.checkpoint && r.models[0]) updateComfyConfig({ checkpoint: r.models[0] })
      } else {
        setModelError(r.error || '拉取失败')
      }
    }
  }

  const handleGenTest = async () => {
    setGenTesting(true); setGenResult(null)
    const r = await generateComfyImage('a cute orange cat sitting on a windowsill, sunny day, cozy room, soft light')
    setGenTesting(false)
    setGenResult(r.ok
      ? { ok: true, text: '✓ 出图成功', image: r.image }
      : { ok: false, text: `✗ ${r.error}` })
  }

  return (
    <SettingSection title="ComfyUI 文生图（仅电脑端）">
      <div className="px-4 pt-2 pb-1 text-[11px] text-wechat-textGray">
        连接本地 ComfyUI 后，角色发朋友圈/聊天时会按需自动配图。
      </div>
      <SettingRow label="启用">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => updateComfyConfig({ enabled: e.target.checked })}
          className="w-5 h-5 accent-wechat-green"
        />
      </SettingRow>
      <SettingRow label="服务地址">
        <SafeInput
          className={inputCls}
          value={cfg.baseUrl}
          placeholder="http://127.0.0.1:8188"
          onChange={(v) => updateComfyConfig({ baseUrl: v })}
        />
      </SettingRow>

      {/* 模型加载模式 */}
      <SettingRow label="模型模式" hint="新模型（Flux/SD3 等）常为 UNet+CLIP+VAE 分离式">
        <select
          className="text-[14px] bg-transparent outline-none"
          value={mode}
          onChange={(e) => {
            updateComfyConfig({ modelMode: e.target.value as any })
            setModels([])
            setModelError(null)
          }}
        >
          <option value="checkpoint">Checkpoint（单文件）</option>
          <option value="unet">UNet + CLIP + VAE（分离式）</option>
        </select>
      </SettingRow>

      {mode === 'checkpoint' ? (
        <SettingRow label="Checkpoint 模型">
          <div className="flex items-center gap-2 justify-end w-full">
            {models.length > 0 ? (
              <select
                className="text-[14px] bg-transparent outline-none max-w-[200px]"
                value={cfg.checkpoint}
                onChange={(e) => updateComfyConfig({ checkpoint: e.target.value })}
              >
                <option value="">请选择...</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <SafeInput
                className={inputCls}
                value={cfg.checkpoint}
                placeholder="点右侧按钮拉取"
                onChange={(v) => updateComfyConfig({ checkpoint: v })}
              />
            )}
            <button onClick={handleFetchModels} disabled={loadingModels} className="p-1.5 rounded hover:bg-wechat-bg shrink-0">
              {loadingModels
                ? <Loader2 size={16} className="animate-spin text-wechat-textGray" />
                : <RefreshCw size={16} className="text-wechat-green" />}
            </button>
          </div>
        </SettingRow>
      ) : (
        <>
          <div className="px-4 pt-1 flex justify-end">
            <button onClick={handleFetchModels} disabled={loadingModels} className="text-[12px] text-wechat-green flex items-center gap-1">
              {loadingModels
                ? <Loader2 size={13} className="animate-spin" />
                : <RefreshCw size={13} />}
              拉取模型列表
            </button>
          </div>
          <UnetModelRow label="UNet 模型" value={cfg.unetName || ''} options={unetModels.unet}
            onChange={(v) => updateComfyConfig({ unetName: v })} />
          <UnetModelRow label="权重精度" value={cfg.unetWeightDtype || 'default'} options={unetModels.weightDtypes.length ? unetModels.weightDtypes : ['default', 'fp8_e4m3fn', 'fp8_e5m2']}
            onChange={(v) => updateComfyConfig({ unetWeightDtype: v })} />
          <UnetModelRow label="CLIP 模型 1" value={cfg.clipName1 || ''} options={unetModels.clip}
            onChange={(v) => updateComfyConfig({ clipName1: v })} />
          <UnetModelRow label="CLIP 模型 2" value={cfg.clipName2 || ''} options={['', ...unetModels.clip]} allowEmpty
            onChange={(v) => updateComfyConfig({ clipName2: v })} />
          <UnetModelRow label="CLIP 类型" value={cfg.clipType || 'stable_diffusion'} options={unetModels.clipTypes.length ? unetModels.clipTypes : ['stable_diffusion', 'sdxl', 'sd3', 'flux']}
            onChange={(v) => updateComfyConfig({ clipType: v })} />
          <UnetModelRow label="VAE 模型" value={cfg.vaeName || ''} options={unetModels.vae}
            onChange={(v) => updateComfyConfig({ vaeName: v })} />
          <div className="px-4 pb-1 text-[11px] text-wechat-textGray">
            单 CLIP 模型时「CLIP 模型 2」留空（如 Qwen），CLIP 类型选 stable_diffusion；Flux/SD3 用双 CLIP 并选对应类型。
          </div>
        </>
      )}
      {modelError && (
        <div className="px-4 pb-2 text-[12px] text-red-500">{modelError}</div>
      )}

      <SettingRow label="画风前缀" hint="拼在 AI 提示词前面的固定 tag（如 masterpiece, anime style）">
        <SafeInput
          className={inputCls}
          value={cfg.positivePrefix}
          placeholder="可留空"
          onChange={(v) => updateComfyConfig({ positivePrefix: v })}
        />
      </SettingRow>
      <SettingRow label="画风后缀" hint="拼在 AI 提示词后面的固定 tag（如 best quality, highly detailed）">
        <SafeInput
          className={inputCls}
          value={cfg.positiveSuffix || ''}
          placeholder="可留空"
          onChange={(v) => updateComfyConfig({ positiveSuffix: v })}
        />
      </SettingRow>
      <SettingRow label="辅助模型改写提示词" hint="出图前用辅助模型把中文描述转成规范英文提示词；可在「预设 → 文生图提示词改写」里定制（tag/自然语言、人物/场景侧重）">
        <input
          type="checkbox"
          checked={!!cfg.promptGenEnabled}
          onChange={(e) => updateComfyConfig({ promptGenEnabled: e.target.checked })}
          className="w-5 h-5 accent-wechat-green"
        />
      </SettingRow>

      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full px-4 py-3 text-[14px] text-wechat-textGray text-left hover:bg-wechat-bg"
      >
        {showAdvanced ? '▼ 高级参数' : '▶ 高级参数'}
      </button>

      {showAdvanced && (
        <>
          <SettingRow label="宽度">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="64" min="256"
              value={cfg.width}
              onChange={(e) => updateComfyConfig({ width: parseInt(e.target.value) || 768 })}
            />
          </SettingRow>
          <SettingRow label="高度">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="64" min="256"
              value={cfg.height}
              onChange={(e) => updateComfyConfig({ height: parseInt(e.target.value) || 768 })}
            />
          </SettingRow>
          <SettingRow label="步数 (steps)">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="1" min="1" max="100"
              value={cfg.steps}
              onChange={(e) => updateComfyConfig({ steps: parseInt(e.target.value) || 25 })}
            />
          </SettingRow>
          <SettingRow label="CFG">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="0.5" min="1" max="30"
              value={cfg.cfg}
              onChange={(e) => updateComfyConfig({ cfg: parseFloat(e.target.value) || 7 })}
            />
          </SettingRow>
          <SettingRow label="采样器">
            <EnumSelectRow
              value={cfg.samplerName}
              options={samplers.length ? samplers : DEFAULT_SAMPLERS}
              placeholder="euler"
              onChange={(v) => updateComfyConfig({ samplerName: v })}
            />
          </SettingRow>
          <SettingRow label="调度器">
            <EnumSelectRow
              value={cfg.scheduler}
              options={schedulers.length ? schedulers : DEFAULT_SCHEDULERS}
              placeholder="normal"
              onChange={(v) => updateComfyConfig({ scheduler: v })}
            />
          </SettingRow>
          <SettingRow label="出图超时（秒）">
            <input
              className="w-full text-[14px] text-right outline-none bg-transparent"
              type="number" step="30" min="30"
              value={cfg.timeoutSec}
              onChange={(e) => updateComfyConfig({ timeoutSec: parseInt(e.target.value) || 180 })}
            />
          </SettingRow>
          <div className="px-4 py-2">
            <div className="text-[13px] mb-1">负面提示词</div>
            <textarea
              className="w-full text-[13px] border border-wechat-divider rounded p-2 outline-none resize-y min-h-[60px]"
              value={cfg.negativePrompt}
              onChange={(e) => updateComfyConfig({ negativePrompt: e.target.value })}
            />
          </div>
          <div className="px-4 py-2">
            <div className="text-[13px] mb-1">自定义工作流 JSON（API 格式，可选）</div>
            <div className="text-[11px] text-wechat-textGray mb-1">
              留空使用内置 txt2img 工作流。支持占位符 %prompt% %negative% %seed%
            </div>
            <textarea
              className="w-full text-[12px] font-mono border border-wechat-divider rounded p-2 outline-none resize-y min-h-[80px]"
              value={cfg.customWorkflow}
              placeholder="留空使用内置工作流"
              onChange={(e) => updateComfyConfig({ customWorkflow: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="px-4 py-2 flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex-1 py-2 bg-wechat-green text-white rounded text-[13px] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {testing && <Loader2 size={14} className="animate-spin" />}
          {testing ? '测试中...' : '测试连接'}
        </button>
        <button
          onClick={handleGenTest}
          disabled={genTesting || !cfg.enabled}
          className="flex-1 py-2 border border-wechat-green text-wechat-green rounded text-[13px] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {genTesting && <Loader2 size={14} className="animate-spin" />}
          {genTesting ? '出图中...' : '测试出图'}
        </button>
      </div>
      {testResult && (
        <div className={`mx-4 mb-2 text-[12px] px-2 py-1.5 rounded ${testResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult}
        </div>
      )}
      {genResult && (
        <div className={`mx-4 mb-2 text-[12px] px-2 py-1.5 rounded ${genResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <div>{genResult.text}</div>
          {genResult.image && (
            <img src={genResult.image} alt="测试出图" className="mt-2 max-w-[200px] rounded" />
          )}
        </div>
      )}
    </SettingSection>
  )
}

// ComfyUI 常见采样器/调度器（未从 ComfyUI 拉取到时的兜底列表）
const DEFAULT_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral',
  'lms', 'dpmpp_2s_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_3m_sde',
  'ddim', 'uni_pc', 'uni_pc_bh2',
]
const DEFAULT_SCHEDULERS = ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta']

/**
 * 枚举下拉选择行：从 options 里选；当前值不在列表中时也保留为一个选项，
 * 避免拉取前已保存的值显示丢失。
 */
function EnumSelectRow({
  value, options, placeholder, onChange,
}: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (v: string) => void
}) {
  const list = value && !options.includes(value) ? [value, ...options] : options
  return (
    <select
      className="text-[14px] bg-transparent outline-none max-w-[220px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {!value && <option value="">{placeholder || '请选择...'}</option>}
      {list.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  )
}

/** UNet 模式下的单个模型选择行：有列表显示下拉，没列表显示手填输入 */
function UnetModelRow({
  label, value, options, onChange, allowEmpty,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  allowEmpty?: boolean
}) {
  const inputCls = 'w-full text-[14px] text-right outline-none bg-transparent placeholder:text-wechat-textGray'
  const hasOptions = options.filter((o) => o !== '').length > 0
  return (
    <SettingRow label={label}>
      {hasOptions ? (
        <select
          className="text-[14px] bg-transparent outline-none max-w-[220px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!value && <option value="">请选择...</option>}
          {allowEmpty && <option value="">（不使用）</option>}
          {options.filter((o) => o !== '').map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      ) : (
        <SafeInput
          className={inputCls}
          value={value}
          placeholder="点上方拉取或手填"
          onChange={onChange}
        />
      )}
    </SettingRow>
  )
}

function UserAvatarRow() {
  const settings = useSettingsStore((s) => s.settings)
  const updateUserPersona = useSettingsStore((s) => s.updateUserPersona)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!settings) return null
  const avatar = settings.userPersona.avatar
  const name = settings.userPersona.name || '我'

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const { fileToCompressedDataUrl } = await import('../utils/image')
      const dataUrl = await fileToCompressedDataUrl(file, 512, 0.85)
      await updateUserPersona({ avatar: dataUrl })
    } catch (e) {
      alert('图片处理失败：' + (e as any)?.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <SettingRow label="头像">
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative group"
        >
          <Avatar src={avatar} name={name} size={44} />
          <div className="absolute inset-0 bg-black/40 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera size={14} className="text-white" />
          </div>
        </button>
        {avatar && (
          <button
            onClick={() => updateUserPersona({ avatar: undefined })}
            className="text-[12px] text-red-500"
          >
            移除
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    </SettingRow>
  )
}

function DataManageRows() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleExportBackup = async (includeApiKeys: boolean) => {
    setBusy(true)
    try {
      const { exportFullBackup } = await import('../services/backupService')
      await exportFullBackup(includeApiKeys)
      setMsg('已导出完整备份')
    } catch (e: any) {
      setMsg('导出失败：' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const handleImportClick = () => fileRef.current?.click()

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setMsg(null)
    setBusy(true)
    try {
      const { peekFileType, importFromFile } = await import('../services/backupService')
      const type = await peekFileType(file)
      if (type === 'full_backup') {
        // 需要二次确认
        setPendingBackupFile(file)
        setBusy(false)
        return
      }
      const r = await importFromFile(file)
      if (r.ok) {
        setMsg(r.message + '（即将刷新以加载新数据）')
        setTimeout(() => location.reload(), 1200)
      } else {
        setMsg(r.message)
      }
    } catch (e: any) {
      setMsg('导入失败：' + (e?.message || e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmRestoreBackup = async () => {
    if (!pendingBackupFile) return
    setBusy(true)
    try {
      const { importFullBackup } = await import('../services/backupService')
      const r = await importFullBackup(pendingBackupFile)
      if (r.ok) {
        alert(r.message)
        location.reload()
      } else {
        setMsg(r.message)
      }
    } catch (e: any) {
      setMsg('恢复失败：' + (e?.message || e))
    } finally {
      setBusy(false)
      setPendingBackupFile(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <SettingRow label="导出完整备份" hint="包含所有数据，默认不含 API 密钥">
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => handleExportBackup(false)}
            disabled={busy}
            className="text-[13px] text-wechat-green px-2 py-1 disabled:opacity-50"
          >
            导出
          </button>
          <button
            onClick={() => handleExportBackup(true)}
            disabled={busy}
            className="text-[12px] text-wechat-textGray px-2 py-1 disabled:opacity-50"
          >
            含密钥导出
          </button>
        </div>
      </SettingRow>

      <SettingRow label="导入数据" hint="自动识别角色/世界书/预设/完整备份">
        <button
          onClick={handleImportClick}
          disabled={busy}
          className="text-[14px] text-wechat-green disabled:opacity-50"
        >
          选择文件
        </button>
      </SettingRow>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {msg && (
        <div className="px-4 py-2 text-[12px] text-wechat-textGray">{msg}</div>
      )}

      {pendingBackupFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-[320px] bg-white rounded-lg p-4">
            <div className="text-[15px] font-medium mb-2">恢复完整备份？</div>
            <div className="text-[13px] text-wechat-textGray mb-4">
              这会<span className="text-red-500">清空当前所有数据</span>并替换为备份内容。建议先导出当前数据。
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingBackupFile(null)}
                className="px-4 py-1.5 text-[14px] text-wechat-textGray"
              >
                取消
              </button>
              <button
                onClick={confirmRestoreBackup}
                disabled={busy}
                className="px-4 py-1.5 text-[14px] bg-red-500 text-white rounded disabled:opacity-50"
              >
                确认恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
