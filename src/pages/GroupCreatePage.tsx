import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, CheckCircle2, Users, Sparkles } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { generateGroupChat } from '../services/aiGroupService'
import Avatar from '../components/Avatar'
import { usePageTour } from '../components/TourOverlay'
import { groupCreateTour } from '../components/tours'

export default function GroupCreatePage() {
  const navigate = useNavigate()
  usePageTour(groupCreateTour)
  const characters = useCharacterStore((s) => s.characters)
  const activeSoloId = useSettingsStore((s) => s.settings?.activeSoloCharacterId)

  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  // AI 智能拉群
  const [aiRequest, setAiRequest] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // 可选成员：全局模式=所有主卡；单卡模式=该世界主卡+NPC（仅好友）
  const candidates = useMemo(() => {
    if (activeSoloId) {
      return characters.filter(
        (c) =>
          c.id === activeSoloId ||
          (c.isNpc && c.parentWorldId === activeSoloId && c.isContact !== false),
      )
    }
    return characters.filter((c) => !c.isNpc)
  }, [characters, activeSoloId])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    if (selected.size < 2) {
      alert('至少选择 2 个成员才能建群')
      return
    }
    setCreating(true)
    try {
      const memberIds = [...selected]
      const groupName = name.trim() || defaultGroupName(memberIds)
      const chat = await useChatStore.getState().createGroupChat(
        groupName,
        memberIds,
        activeSoloId || undefined,
      )
      navigate(`/chat/${chat.id}`, { replace: true })
    } finally {
      setCreating(false)
    }
  }

  function defaultGroupName(memberIds: string[]): string {
    const names = memberIds
      .map((id) => characters.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .slice(0, 3)
    return names.join('、') + (memberIds.length > 3 ? `等${memberIds.length}人` : '')
  }

  const handleAiGenerate = async () => {
    setAiGenerating(true)
    setAiError(null)
    try {
      const r = await generateGroupChat(aiRequest.trim())
      if (!r.ok || !r.chat) {
        setAiError(r.error || '生成失败')
        return
      }
      if (r.createdNpcs && r.createdNpcs.length > 0) {
        alert(`AI 引入了 ${r.createdNpcs.length} 个新角色：\n${r.createdNpcs.map((n) => `· ${n.name}（${n.relation}）`).join('\n')}\n\nTA 们目前只存在于群里，加好友后才会出现在通讯录。`)
      }
      navigate(`/chat/${r.chat.id}`, { replace: true })
    } catch (e: any) {
      setAiError(e?.message || String(e))
    } finally {
      setAiGenerating(false)
    }
  }

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">发起群聊</h1>
        <button
          onClick={handleCreate}
          disabled={selected.size < 2 || creating}
          className="px-3 py-1.5 mr-1 bg-wechat-green text-white text-[13px] rounded disabled:opacity-40"
        >
          {creating ? '创建中' : `建群(${selected.size})`}
        </button>
      </header>

      {/* AI 智能拉群 */}
      <div className="bg-white mt-3 px-4 py-3" data-tour="ai-group">
        <div className="text-[12px] text-wechat-textGray mb-1 flex items-center gap-1">
          <Sparkles size={14} className="text-purple-500" />
          AI 智能拉群（说说你想建什么群，AI 来挑人{activeSoloId ? '、必要时引入新配角' : ''}）
        </div>
        <div className="flex gap-2">
          <input
            value={aiRequest}
            onChange={(e) => setAiRequest(e.target.value)}
            placeholder={activeSoloId ? '例：建一个家庭群 / 拉上他的同事们建个聚餐群' : '例：把大家拉一个闲聊群'}
            className="flex-1 px-3 py-2 bg-wechat-bg rounded text-[14px] outline-none"
            maxLength={100}
            disabled={aiGenerating}
          />
          <button
            onClick={handleAiGenerate}
            disabled={aiGenerating}
            className="shrink-0 px-3 py-2 bg-purple-500 text-white text-[13px] rounded disabled:opacity-50 flex items-center gap-1"
          >
            <Sparkles size={13} />
            {aiGenerating ? '生成中...' : '智能建群'}
          </button>
        </div>
        {aiError && (
          <div className="mt-2 text-[12px] text-red-500">{aiError}</div>
        )}
      </div>

      <div className="mx-4 mt-3 mb-1 text-[11px] text-wechat-textGray text-center">—— 或手动选人建群 ——</div>

      <div className="bg-white mt-2 px-4 py-3">
        <div className="text-[12px] text-wechat-textGray mb-1">群名（留空自动生成）</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="给群起个名字"
          className="w-full px-3 py-2 bg-wechat-bg rounded text-[14px] outline-none"
          maxLength={20}
        />
      </div>

      {activeSoloId && (
        <div className="mx-4 mt-2 text-[11px] text-orange-500">
          当前处于单卡模式，该群将归属此世界（成员可包含本世界 NPC）
        </div>
      )}

      <div className="mt-3">
        <div className="px-4 py-2 text-[12px] text-wechat-textGray flex items-center gap-1">
          <Users size={14} />
          选择群成员（至少 2 个）
        </div>
        <div className="bg-white">
          {candidates.length === 0 && (
            <div className="px-4 py-8 text-center text-wechat-textGray text-[13px]">
              没有可选的角色
            </div>
          )}
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg text-left"
            >
              {selected.has(c.id) ? (
                <CheckCircle2 size={20} className="text-wechat-green shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-wechat-divider shrink-0" />
              )}
              <Avatar src={c.avatar} name={c.name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] truncate">{c.name}</div>
                {c.isNpc && (
                  <div className="text-[11px] text-wechat-textGray truncate">
                    NPC{c.npcRelation ? ` · ${c.npcRelation}` : ''}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}