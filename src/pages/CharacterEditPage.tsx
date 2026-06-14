import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Sparkles, Camera, Images } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useLorebookStore } from '../stores/lorebookStore'
import { rewriteAsImGreeting } from '../services/apiService'
import { getActiveUtilityPrompt } from '../services/utilityPrompts'
import { SafeInput } from '../components/SafeInput'
import { SafeTextarea } from '../components/SafeTextarea'
import Avatar from '../components/Avatar'
import AvatarPickerDialog from '../components/AvatarPickerDialog'
import { uuid } from '../utils/id'
import type { Character } from '../types'

/** 空白角色卡（从零新建用） */
function blankCharacter(): Character {
  const now = Date.now()
  return {
    id: uuid(),
    name: '',
    avatar: undefined,
    description: '',
    personality: '',
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
    isNpc: false,
    privateMemory: '',
    createdAt: now,
    updatedAt: now,
  }
}

export default function CharacterEditPage() {
  const { id = '' } = useParams()
  /** 无 id = 新建模式（路由 /character-create） */
  const isCreate = !id
  const navigate = useNavigate()
  const original = useCharacterStore((s) => s.getById(id))
  const update = useCharacterStore((s) => s.update)
  const add = useCharacterStore((s) => s.add)
  const settings = useSettingsStore((s) => s.settings)
  const lorebooks = useLorebookStore((s) => s.lorebooks)
  const createLorebook = useLorebookStore((s) => s.createLorebook)

  const [draft, setDraft] = useState<Character | null>(null)
  const [rewriting, setRewriting] = useState(false)
  const [rewriteErr, setRewriteErr] = useState<string | null>(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreate) {
      setDraft((d) => d ?? blankCharacter())
    } else if (original) {
      setDraft({ ...original })
    }
  }, [original, isCreate])

  if (!draft) {
    return (
      <div className="min-h-full bg-wechat-bg flex flex-col">
        <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ChevronLeft size={22} />
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center text-wechat-textGray">
          角色不存在
        </div>
      </div>
    )
  }

  const patch = <K extends keyof Character>(key: K, value: Character[K]) => {
    setDraft({ ...draft, [key]: value })
  }

  const handleSave = async () => {
    if (isCreate) {
      if (!draft.name.trim()) {
        alert('请填写角色名')
        return
      }
      await add({ ...draft, name: draft.name.trim(), updatedAt: Date.now() })
      navigate(`/character/${draft.id}`, { replace: true })
      return
    }
    await update(draft.id, draft)
    navigate(-1)
  }

  const handleCreateLorebook = async () => {
    const name = prompt('新世界书名字：', `${draft.name} 的世界书`)
    if (!name?.trim()) return
    const book = await createLorebook(name.trim())
    patch('lorebookId', book.id)
  }

  const handleRewrite = async () => {
    if (!settings?.apiConfig) return
    setRewriting(true)
    setRewriteErr(null)
    const promptTemplate = getActiveUtilityPrompt('im_greeting_rewrite')
    const r = await rewriteAsImGreeting(
      settings.apiConfig.primary,
      draft.name,
      draft.firstMes,
      promptTemplate,
    )
    setRewriting(false)
    if (r.ok) {
      patch('imFirstMes', r.text)
    } else {
      setRewriteErr(r.error)
    }
  }

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => patch('avatar', reader.result as string)
    reader.readAsDataURL(file)
  }

  const altGreetingsText = draft.alternateGreetings.join('\n---\n')
  const setAltGreetings = (text: string) => {
    const arr = text.split(/\n---\n/).map((s) => s.trim()).filter(Boolean)
    patch('alternateGreetings', arr)
  }

  const tagsText = draft.tags.join(', ')
  const setTags = (text: string) => {
    const arr = text.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    patch('tags', arr)
  }

  return (
    <div className="min-h-full bg-wechat-bg pb-8">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">{isCreate ? '新建角色' : '编辑角色'}</h1>
        <button
          onClick={handleSave}
          className="px-3 py-1 text-[14px] text-wechat-green font-medium"
        >
          保存
        </button>
      </header>

      <div className="mt-3 px-3">
      <div className="bg-white rounded-xl border border-wechat-divider shadow-sm px-4 py-5 flex items-center gap-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative"
          title="上传头像"
        >
          <Avatar src={draft.avatar} name={draft.name} size={64} />
          <div className="absolute inset-0 bg-black/40 rounded-md opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera size={18} className="text-white" />
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleAvatarPick(e.target.files?.[0])}
        />
        <div className="flex-1">
          <SafeInput
            className="w-full text-[18px] font-medium outline-none border-b border-wechat-divider pb-1"
            value={draft.name}
            onChange={(v) => patch('name', v)}
            placeholder="角色名"
          />
          <button
            onClick={() => setShowAvatarPicker(true)}
            className="mt-1.5 flex items-center gap-1 text-[12px] text-wechat-link"
          >
            <Images size={12} />
            从头像库选择
          </button>
        </div>
      </div>
      </div>

      {showAvatarPicker && (
        <AvatarPickerDialog
          forCharacterId={draft.id}
          onPick={(image) => patch('avatar', image)}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      <Section title="绑定世界书">
        <div className="bg-white px-3 py-2.5 flex items-center gap-2">
          <select
            className="flex-1 text-[14px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
            value={draft.lorebookId || ''}
            onChange={(e) => patch('lorebookId', e.target.value || undefined)}
          >
            <option value="">（无）</option>
            {lorebooks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              const name = prompt('新建世界书名称：', `${draft.name} 的世界书`)
              if (!name?.trim()) return
              const { db } = await import('../db')
              const { uuid } = await import('../utils/id')
              const now = Date.now()
              const book = {
                id: uuid(),
                name: name.trim(),
                description: undefined,
                createdAt: now,
                updatedAt: now,
              }
              await db.lorebooks.add(book)
              const { useLorebookStore } = await import('../stores/lorebookStore')
              await useLorebookStore.getState().load()
              patch('lorebookId', book.id)
            }}
            className="px-3 py-1.5 text-[12px] text-wechat-green border border-wechat-green rounded shrink-0"
          >
            新建
          </button>


          {draft.lorebookId ? (
            <button
              onClick={() => navigate(`/lorebook/${draft.lorebookId}`)}
              className="px-3 py-1.5 text-[12px] text-wechat-green border border-wechat-green rounded shrink-0"
            >
              管理
            </button>
          ) : (
            <button
              onClick={handleCreateLorebook}
              className="px-3 py-1.5 text-[12px] text-wechat-green border border-wechat-green rounded shrink-0"
            >
              新建
            </button>
          )}
        </div>
      </Section>


      <Section title="微信开场白（短消息，多条用换行分隔）">
        <SafeTextarea
          rows={3}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          placeholder="（留空则使用原始开场白）"
          value={draft.imFirstMes || ''}
          onChange={(v) => patch('imFirstMes', v)}
        />
        <div className="px-3 pb-3 flex items-center gap-2">
          <button
            onClick={handleRewrite}
            disabled={rewriting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-wechat-green text-white rounded-full disabled:opacity-60"
          >
            {rewriting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {rewriting ? '改写中...' : 'AI 从原始开场白改写'}
          </button>
          {rewriteErr && (
            <span className="text-[12px] text-red-500">{rewriteErr}</span>
          )}
        </div>
      </Section>

      <Section title="原始开场白（场景模式用）">
        <SafeTextarea
          rows={5}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.firstMes}
          onChange={(v) => patch('firstMes', v)}
        />
      </Section>

      <Section title="备选开场白（用 --- 分隔多条）">
        <SafeTextarea
          rows={4}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={altGreetingsText}
          onChange={setAltGreetings}
        />
      </Section>

      <Section title="人设描述">
        <SafeTextarea
          rows={5}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.description}
          onChange={(v) => patch('description', v)}
        />
      </Section>

      <Section title="性格">
        <SafeTextarea
          rows={3}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.personality}
          onChange={(v) => patch('personality', v)}
        />
      </Section>

      <Section title="场景">
        <SafeTextarea
          rows={3}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.scenario}
          onChange={(v) => patch('scenario', v)}
        />
      </Section>

      <Section title="对话示例">
        <SafeTextarea
          rows={5}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white font-mono"
          value={draft.mesExample}
          onChange={(v) => patch('mesExample', v)}
        />
      </Section>

      <Section title="角色卡 System Prompt（可选）">
        <SafeTextarea
          rows={3}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.systemPrompt || ''}
          onChange={(v) => patch('systemPrompt', v)}
        />
      </Section>

      <Section title="历史后指令 Post-history（可选）">
        <SafeTextarea
          rows={3}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.postHistoryInstructions || ''}
          onChange={(v) => patch('postHistoryInstructions', v)}
        />
      </Section>

      <Section title="标签（用逗号分隔）">
        <SafeInput
          className="w-full text-[14px] p-3 outline-none bg-white"
          value={tagsText}
          onChange={setTags}
        />
      </Section>

      <Section title="作者备注">
        <SafeTextarea
          rows={2}
          className="w-full text-[14px] p-3 outline-none resize-none bg-white"
          value={draft.creatorNotes || ''}
          onChange={(v) => patch('creatorNotes', v)}
        />
      </Section>

      <Section title="静默">
        <div className="bg-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[14px]">不参与自动补算</div>
            <div className="text-[11px] text-wechat-textGray mt-0.5">开启后角色不会主动发消息、发朋友圈或回复评论</div>
          </div>
          <input
            type="checkbox"
            checked={draft.muted || false}
            onChange={(e) => patch('muted', e.target.checked)}
            className="w-5 h-5 accent-wechat-green"
          />
        </div>
      </Section>

      <Section title={`主动程度：${draft.activeLevel}`}>
        <div className="px-3 py-3 bg-white">
          <input
            type="range"
            min="0" max="10" step="1"
            value={draft.activeLevel}
            onChange={(e) => patch('activeLevel', parseInt(e.target.value))}
            className="w-full accent-wechat-green"
          />
          <div className="flex justify-between text-[11px] text-wechat-textGray mt-1">
            <span>从不主动</span>
            <span>非常主动</span>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 px-3">
      <div className="px-1 pb-1.5 text-[13px] font-semibold text-wechat-textGray">{title}</div>
      <div className="bg-white rounded-xl border border-wechat-divider overflow-hidden shadow-sm">
        {children}
      </div>
    </div>
  )
}
