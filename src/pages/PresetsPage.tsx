import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Sparkles, MessageCircle, RefreshCw, Wrench, CheckCircle2 } from 'lucide-react'
import { usePresetStore } from '../stores/presetStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { UtilityType } from '../types'

const UTILITY_TYPE_LABELS: Record<UtilityType, string> = {
  screening: '粗筛',
  thinking: '深思',
  scene_summary: '场景摘要',
  world_summary: '世界事件摘要',
  npc_generate: 'NPC 生成',
  im_greeting_rewrite: '改写微信开场白',
  moment_generate: '朋友圈生成判定',
  comment_reply: '朋友圈评论回复',
  moment_summary: '朋友圈摘要',
  image_describe: '图片识别描述',
  group_chat: '群聊扮演·粗略',
  group_fine: '群聊扮演·精细',
  group_generate: 'AI 智能拉群',
  image_prompt_gen: '文生图提示词改写',
}

const UTILITY_TYPES: UtilityType[] = [
  'screening', 'thinking', 'scene_summary', 'world_summary', 'npc_generate',
  'im_greeting_rewrite', 'moment_generate', 'comment_reply', 'moment_summary',
  'image_describe', 'group_chat', 'group_fine', 'group_generate', 'image_prompt_gen',
]



export default function PresetsPage() {
  const navigate = useNavigate()
  const presets = usePresetStore((s) => s.presets)
  const create = usePresetStore((s) => s.create)
  const resetBuiltins = usePresetStore((s) => s.resetBuiltins)
  const settings = useSettingsStore((s) => s.settings)
  const setActive = useSettingsStore((s) => s.setActiveUtilityPreset)

  const imPresets = presets.filter((p) => p.mode === 'im')
  const scenePresets = presets.filter((p) => p.mode === 'scene')
  const utilityPresets = presets.filter((p) => p.mode === 'utility')

  const handleCreate = async (mode: 'im' | 'scene') => {
    const name = prompt(`新建${mode === 'im' ? '微信' : '场景'}预设的名字：`)
    if (!name?.trim()) return
    const p = await create(mode, name.trim())
    navigate(`/preset/${p.id}`)
  }

  const handleCreateUtility = async (type: UtilityType) => {
    const name = prompt(`新建${UTILITY_TYPE_LABELS[type]} 预设的名字：`)
    if (!name?.trim()) return
    const p = await create('utility', name.trim(), undefined, type)
    navigate(`/preset/${p.id}`)
  }

  const handleResetBuiltins = async () => {
    if (!confirm('重置内置预设？\n你对内置预设做的修改会丢失，但自定义预设不受影响。')) return
    await resetBuiltins()
    alert('已重置')
  }

  return (
    <div className="min-h-full bg-wechat-bg pb-8">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">预设</h1>
        <button onClick={handleResetBuiltins} className="p-2" title="重置内置预设">
          <RefreshCw size={18} />
        </button>
      </header>

      <PresetGroup
        title="微信模式预设"
        icon={<MessageCircle size={16} className="text-wechat-green" />}
        presets={imPresets}
        onCreate={() => handleCreate('im')}
        onOpen={(id) => navigate(`/preset/${id}`)}
      />

      <PresetGroup
        title="场景模式预设"
        icon={<Sparkles size={16} className="text-purple-500" />}
        presets={scenePresets}
        onCreate={() => handleCreate('scene')}
        onOpen={(id) => navigate(`/preset/${id}`)}
      />

      <div className="mt-3">
        <div className="px-4 py-2 text-[12px] text-wechat-textGray flex items-center gap-1">
          <Wrench size={16} className="text-orange-500" />
          内部任务预设
        </div>
        {UTILITY_TYPES.map((type) => {
          const matching = utilityPresets.filter((p) => p.utilityType === type)
          const activeId = settings?.utilityPresetMap?.[type]
          return (
            <div key={type} className="bg-white mb-2">
              <div className="px-4 py-2 text-[11px] text-wechat-textGray border-b border-wechat-divider/50">
                {UTILITY_TYPE_LABELS[type]}
              </div>
              {matching.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center border-b border-wechat-divider last:border-b-0"
                >
                  <button
                    onClick={() => setActive(type, p.id)}
                    className="p-3 shrink-0"
                    title={activeId === p.id ? '当前使用中' : '设为使用中'}
                  >
                    {activeId === p.id ? (
                      <CheckCircle2 size={18} className="text-wechat-green" />
                    ) : (
                      <div className="w-[18px] h-[18px] rounded-full border-2 border-wechat-divider" />
                    )}
                  </button>
                  <button
                    onClick={() => navigate(`/preset/${p.id}`)}
                    className="flex-1 flex items-center justify-between py-3 pr-4 text-left hover:bg-wechat-bg"
                  >
                    <div>
                      <div className="text-[14px] flex items-center gap-2">
                        {p.name}
                        {p.builtin && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-wechat-green/10 text-wechat-green rounded">
                            内置
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-wechat-textGray" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => handleCreateUtility(type)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-wechat-green text-[13px] hover:bg-wechat-bg"
              >
                <Plus size={14} />
                新建{UTILITY_TYPE_LABELS[type]} 预设
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PresetGroup({
  title, icon, presets, onCreate, onOpen,
}: {
  title: string
  icon: React.ReactNode
  presets: ReturnType<typeof usePresetStore.getState>['presets']
  onCreate: () => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="mt-3">
      <div className="px-4 py-2 text-[12px] text-wechat-textGray flex items-center gap-1">
        {icon}{title}
      </div>
      <div className="bg-white">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[15px] truncate flex items-center gap-2">
                {p.name}
                {p.builtin && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-wechat-green/10 text-wechat-green rounded">
                    内置
                  </span>
                )}
              </div>
              <div className="text-[12px] text-wechat-textGray">
                {p.slots.length} 个槽位 · {p.slots.filter((s) => s.enabled).length} 启用
              </div>
            </div>
            <ChevronRight size={18} className="text-wechat-textGray" />
          </button>
        ))}
        <button
          onClick={onCreate}
          className="w-full flex items-center gap-2 px-4 py-3 text-wechat-green text-[14px] hover:bg-wechat-bg"
        >
          <Plus size={16} />
          新建
        </button>
      </div>
    </div>
  )
}
