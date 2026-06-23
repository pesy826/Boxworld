import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { ChevronLeft, Trash2, MessageCircle, BookOpen, Pencil, Share2, Brain, UserCircle2, UserPlus } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { useChatStore } from '../stores/chatStore'
import { useLorebookStore } from '../stores/lorebookStore'
import { useWorldSummaryStore } from '../stores/worldSummaryStore'
import Avatar from '../components/Avatar'
import CharacterStickerSlots from '../components/CharacterStickerSlots'
import { usePageTour } from '../components/TourOverlay'
import { characterDetailTour } from '../components/tours'

export default function CharacterDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const character = useCharacterStore((s) => s.getById(id))
  const remove = useCharacterStore((s) => s.remove)
  const updateCharacter = useCharacterStore((s) => s.update)
  usePageTour(characterDetailTour)


  if (!character) {
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

  const handleDelete = async () => {
    if (!confirm(`确定删除角色"${character.name}"？\n该角色的所有聊天记录、朋友圈也会一起删除，且无法恢复。`)) return
    await remove(character.id)
    navigate(-1)
  }

  const handleStartChat = async () => {
    const chat = await useChatStore.getState().getOrCreateChat(character.id)
    navigate(`/chat/${chat.id}`)
  }

  const isContact = character.isContact !== false

  const handleAddContact = async () => {
    await updateCharacter(character.id, { isContact: true })
    alert(`已将「${character.name}」添加为好友，现在可以在通讯录中找到 TA 并单独聊天了。`)
  }

  const handleLorebookClick = async () => {
    if (character.lorebookId) {
      navigate(`/lorebook/${character.lorebookId}`)
      return
    }
    if (!confirm(`该角色暂无世界书。\n是否为「${character.name}」创建一本新世界书并绑定？`)) return
    const book = await useLorebookStore.getState().createLorebook(`${character.name}的世界书`)
    await useCharacterStore.getState().update(character.id, { lorebookId: book.id })
    navigate(`/lorebook/${book.id}`)
  }


  return (
    <div className="min-h-full bg-wechat-bg">
      {/* 顶部栏：返回 + 标题 + 编辑按钮 */}
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">角色详情</h1>
        <ExportMenu characterId={character.id} />
        <button
          onClick={() => navigate(`/character/${character.id}/edit`)}
          className="px-3 py-1 text-[14px] text-wechat-green flex items-center gap-1"
        >
          <Pencil size={14} />
          编辑
        </button>
      </header>


      {/* 头像 + 姓名 */}
      <div className="bg-white px-4 py-5 flex items-center gap-4">
        <Avatar src={character.avatar} name={character.name} size={64} />
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-medium truncate flex items-center gap-1.5">
            {character.name}
            {!isContact && (
              <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded shrink-0">非好友</span>
            )}
          </div>
          {character.isNpc && character.npcRelation && (
            <div className="text-[12px] text-wechat-textGray mt-1 truncate">{character.npcRelation}</div>
          )}
          {character.tags.length > 0 && (
            <div className="text-[12px] text-wechat-textGray mt-1">
              {character.tags.join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* 用户人设（高亮可编辑，置顶） */}
      <div data-tour="user-profile">
        <UserProfileSection character={character} />
      </div>

      {/* 角色专属常用表情（按情绪分类上传，聊天时优先发） */}
      <CharacterStickerSlots character={character} />

      {/* 关联资源入口 */}
      <div className="mt-3 bg-white">
        <button
          onClick={handleLorebookClick}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg"
        >
          <span className="flex items-center gap-2 text-[14px]">
            <BookOpen size={16} className="text-wechat-textGray" />
            世界书
          </span>
          <span className="text-[13px] text-wechat-textGray">
            {character.lorebookId ? '已绑定 ›' : '无（点击创建）'}
          </span>
        </button>
      </div>


      {/* 记忆管理（可编辑） */}
      <MemorySection character={character} />

      {/* 字段展示 */}
      {character.imFirstMes && (
        <Section title="微信开场白" content={character.imFirstMes} />
      )}
      <Section title="人设描述" content={character.description} />
      <Section title="性格" content={character.personality} />
      <Section title="场景" content={character.scenario} />
      <Section title="初次见面" content={character.firstMes} />
      {character.alternateGreetings.length > 0 && (
        <Section
          title={`备选开场白（${character.alternateGreetings.length}）`}
          content={character.alternateGreetings.join('\n\n---\n\n')}
        />
      )}
      <Section title="对话示例" content={character.mesExample} />
      {character.creatorNotes && (
        <Section title="作者备注" content={character.creatorNotes} />
      )}

      {/* 操作 */}
      <div className="mt-4 px-4 space-y-2">
        {isContact ? (
          <button
            onClick={handleStartChat}
            data-tour="send-message"
            className="w-full py-2.5 bg-wechat-green text-white rounded-lg text-[14px] font-medium flex items-center justify-center gap-2"
          >
            <MessageCircle size={16} />
            发消息
          </button>
        ) : (
          <>
            <button
              onClick={handleAddContact}
              className="w-full py-2.5 bg-wechat-green text-white rounded-lg text-[14px] font-medium flex items-center justify-center gap-2"
            >
              <UserPlus size={16} />
              加为好友
            </button>
            <div className="text-[11px] text-wechat-textGray text-center">
              TA 目前只在群聊中，加为好友后才会出现在通讯录并可单独聊天
            </div>
          </>
        )}
        <button
          onClick={handleDelete}
          className="w-full py-2.5 bg-white text-red-500 rounded-lg text-[14px] font-medium flex items-center justify-center gap-2"
        >
          <Trash2 size={16} />
          删除角色
        </button>
      </div>

      <div className="h-8" />
    </div>
  )
}

/** 用户人设：详情页顶部高亮区块，点击直接编辑 */
function UserProfileSection({ character }: {
  character: { id: string; isNpc: boolean; userProfile?: string }
}) {
  const updateCharacter = useCharacterStore((s) => s.update)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const value = character.userProfile?.trim() || ''

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCharacter(character.id, { userProfile: draft.trim() })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-3 mx-3 bg-white rounded-lg border border-wechat-green/40 p-3">
        <div className="text-[12px] text-wechat-textGray mb-2 flex items-center gap-1">
          <UserCircle2 size={14} className="text-wechat-green" />
          用户人设（该角色视角下的你是谁、什么关系）
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          autoFocus
          className="w-full px-2 py-2 bg-wechat-bg rounded text-[13px] outline-none resize-y"
          placeholder={character.isNpc
            ? '留空则使用所属世界主卡的用户人设。例：刚搬来公寓的新住户'
            : '例：{{user}}，刚认识的网友 / TA 的儿子，20 岁大学生。留空则只使用全局昵称'}
        />
        <div className="flex gap-2 mt-2 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1 text-[13px] text-wechat-textGray"
            disabled={saving}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-wechat-green text-white rounded text-[13px] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  if (!value) {
    // 未填：高亮按钮提示
    return (
      <button
        onClick={startEdit}
        className="mt-3 mx-3 w-[calc(100%-1.5rem)] bg-wechat-green/10 border border-wechat-green/40 rounded-lg px-4 py-3 flex items-center gap-2 text-left"
      >
        <UserCircle2 size={20} className="text-wechat-green shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-wechat-green font-medium">设置用户人设</div>
          <div className="text-[11px] text-wechat-textGray mt-0.5">
            告诉 TA 你是谁、和 TA 什么关系{character.isNpc ? '（留空用主卡的）' : ''}
          </div>
        </div>
        <Pencil size={14} className="text-wechat-green shrink-0" />
      </button>
    )
  }

  // 已填：显示内容 + 点击编辑
  return (
    <button
      onClick={startEdit}
      className="mt-3 mx-3 w-[calc(100%-1.5rem)] bg-white rounded-lg border border-wechat-divider px-4 py-3 text-left"
    >
      <div className="text-[12px] text-wechat-textGray mb-1 flex items-center gap-1">
        <UserCircle2 size={14} className="text-wechat-green" />
        用户人设（点击编辑）
      </div>
      <div className="text-[13px] whitespace-pre-wrap break-words">{value}</div>
    </button>
  )
}

/** 记忆管理：私有记忆（所有角色）+ 世界事件记忆（仅主卡） */
function MemorySection({ character }: {
  character: { id: string; isNpc: boolean; parentWorldId?: string; privateMemory: string }
}) {
  const updateCharacter = useCharacterStore((s) => s.update)
  const worldSummary = useWorldSummaryStore((s) => character.isNpc ? undefined : s.summaries[character.id])
  const upsertWorldSummary = useWorldSummaryStore((s) => s.upsert)

  return (
    <div className="mt-3 bg-white">
      <div className="px-4 py-2 text-[12px] text-wechat-textGray flex items-center gap-1">
        <Brain size={14} />
        记忆管理（可手动修正 AI 写入的内容）
      </div>

      <EditableMemory
        label="私有记忆（角色聊天时能看到的世界近况）"
        value={character.privateMemory || ''}
        placeholder="（暂无私有记忆）"
        onSave={async (text) => {
          await updateCharacter(character.id, { privateMemory: text })
        }}
      />

      {!character.isNpc && (
        <EditableMemory
          label="世界事件记忆（该世界的客观事件流水账，深思时用于同步）"
          value={worldSummary?.content || ''}
          placeholder="（暂无世界事件记忆）"
          onSave={async (text) => {
            await upsertWorldSummary({
              id: worldSummary?.id || character.id,
              worldId: character.id,
              content: text,
              scannedSeq: worldSummary?.scannedSeq || {},
              updatedAt: Date.now(),
            })
          }}
        />
      )}
    </div>
  )
}

function EditableMemory({
  label, value, placeholder, onSave,
}: {
  label: string
  value: string
  placeholder: string
  onSave: (text: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-wechat-divider/50">
      <div className="px-4 pt-2 pb-1 flex items-center justify-between">
        <span className="text-[12px] text-wechat-textGray">{label}</span>
        {!editing && (
          <button
            onClick={startEdit}
            className="text-[12px] text-wechat-green px-2 py-0.5"
          >
            编辑
          </button>
        )}
      </div>
      {editing ? (
        <div className="px-4 pb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full px-2 py-2 bg-wechat-bg rounded text-[13px] outline-none resize-y"
            placeholder="每行一条记忆，清空表示删除全部"
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-[13px] text-wechat-textGray"
              disabled={saving}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-wechat-green text-white rounded text-[13px] disabled:opacity-50"
              disabled={saving}
            >
              {saving ? '保存中' : '保存'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3 text-[13px] whitespace-pre-wrap break-words text-wechat-textDark">
          {value || <span className="text-wechat-textGray">{placeholder}</span>}
        </div>
      )}
    </div>
  )
}

function Section({ title, content }: { title: string; content: string }) {
  if (!content) return null
  return (
    <div className="mt-3 bg-white">
      <div className="px-4 py-2 text-[12px] text-wechat-textGray">{title}</div>
      <div className="px-4 pb-3 text-[14px] whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  )
}

function ExportMenu({ characterId }: { characterId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const doExport = async (kind: 'share' | 'full') => {
    setBusy(true)
    try {
      const svc = await import('../services/backupService')
      const path = kind === 'share'
        ? await svc.exportCharacterShare(characterId)
        : await svc.exportCharacterFull(characterId)
      if (path) alert('已导出到：\n' + path)
    } catch (e: any) {
      alert('导出失败：' + (e?.message || e))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-2" title="导出" disabled={busy}>
        <Share2 size={18} className="text-wechat-textGray" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-white shadow-lg rounded border border-wechat-divider z-20 text-[13px]">
            <button onClick={() => doExport('share')} className="w-full text-left px-3 py-2 hover:bg-wechat-bg">
              导出（分享用·精简）
            </button>
            <button onClick={() => doExport('full')} className="w-full text-left px-3 py-2 hover:bg-wechat-bg">
              导出（完整·整个世界：NPC/群聊/记忆）
            </button>
          </div>
        </>
      )}
    </div>
  )
}
