import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Send, Loader2, MessageCircle, Clock } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import { sendSceneMessage, regenerateSceneMessage } from '../services/sceneService'
import { advanceCharacterTime, setCharacterTime } from '../services/soloModeService'
import { SafeTextarea } from '../components/SafeTextarea'
import MessageContextMenu, { type MenuItem } from '../components/MessageContextMenu'
import MessageEditDialog from '../components/MessageEditDialog'
import NarrativeText from '../components/NarrativeText'
import Avatar from '../components/Avatar'
import { useCharacterTime } from '../services/useVirtualTime'
import { formatFull } from '../utils/time'
import { formatDuration } from '../utils/timeParse'
import { usePageTour } from '../components/TourOverlay'
import { sceneTour } from '../components/tours'
import type { Message } from '../types'

export default function SceneModePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  usePageTour(sceneTour)
  const chat = useChatStore((s) => s.chats.find((c) => c.id === id))
  const messagesMap = useChatStore((s) => s.messagesByChat)
  const allMessages = messagesMap[id] || []
  const sceneMessages = allMessages.filter((m) => m.type === 'scene_narrative')
  const loadMessages = useChatStore((s) => s.loadMessages)
  const character = useCharacterStore((s) => chat ? s.getById(chat.characterId) : undefined)
  const userName = useSettingsStore((s) => s.settings?.userPersona.name) || '我'
  const userAvatar = useSettingsStore((s) => s.settings?.userPersona.avatar)
  const sceneTime = useCharacterTime(character?.id)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [timeTip, setTimeTip] = useState<string | null>(null)
  const [showTimeMenu, setShowTimeMenu] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)

  useEffect(() => {
    if (chat) loadMessages(chat.id)
  }, [chat?.id, loadMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [sceneMessages.length, sending, streamingText])

  if (!chat || !character) {
    return (
      <div className="min-h-full bg-stone-50 flex flex-col">
        <header className="h-header-safe flex items-center px-2 bg-white border-b border-stone-200">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ChevronLeft size={22} />
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center text-stone-400">
          会话不存在
        </div>
      </div>
    )
  }

  const isSolo = character.soloModeEntered

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setError(null)
    setTimeTip(null)
    setStreamingText('')
    const r = await sendSceneMessage(chat.id, character.id, text, {
      onDelta: (acc) => setStreamingText(acc),
    })
    setSending(false)
    setStreamingText(null)
    if (!r.ok) setError(r.error || '失败')
    else if (r.advancedMs && r.advancedMs > 0) {
      setTimeTip(`⏱ 时间推进了 ${formatDuration(r.advancedMs)}`)
      setTimeout(() => setTimeTip(null), 4000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleManualAdvance = async (deltaMs: number) => {
    if (!isSolo) {
      alert('手动控时仅在单卡模式下可用。请先在通讯录长按该角色进入单卡模式。')
      setShowTimeMenu(false)
      return
    }
    await advanceCharacterTime(character.id, deltaMs)
    setShowTimeMenu(false)
  }

  const handleManualSet = async () => {
    if (!isSolo) {
      alert('手动控时仅在单卡模式下可用。')
      setShowTimeMenu(false)
      return
    }
    const input = prompt('设置场景时间（格式 2026-06-12 18:00）：',
      new Date(sceneTime).toLocaleString('zh-CN', { hour12: false }))
    if (!input) return
    const ts = Date.parse(input.replace(/\//g, '-').trim())
    if (isNaN(ts)) {
      alert('时间格式不对')
      return
    }
    await setCharacterTime(character.id, ts)
    setShowTimeMenu(false)
  }

  const openContextMenu = (e: { clientX: number; clientY: number }, message: Message) => {
    setContextMenu({ x: e.clientX, y: e.clientY, message })
  }

  const buildMenuItems = (msg: Message): MenuItem[] => {
    const items: MenuItem[] = []
    items.push({ label: '复制', onClick: () => navigator.clipboard?.writeText(msg.content).catch(() => {}) })
    items.push({ label: '编辑', onClick: () => setEditing(msg) })
    if (msg.role === 'assistant') {
      items.push({
        label: '重发',
        onClick: async () => {
          setError(null)
          setSending(true)
          setStreamingText('')
          const r = await regenerateSceneMessage(chat.id, character.id, msg.id, {
            onDelta: (acc) => setStreamingText(acc),
          })
          setSending(false)
          setStreamingText(null)
          if (!r.ok) setError(r.error || '重发失败')
        },
      })
    }
    items.push({
      label: '删除',
      danger: true,
      onClick: async () => {
        if (confirm('删除这段叙事？')) {
          await useChatStore.getState().deleteMessage(chat.id, msg.id)
        }
      },
    })
    return items
  }

  const handleEditConfirm = async (newText: string) => {
    if (!editing) return
    await useChatStore.getState().updateMessageContent(editing.id, newText.trim())
    setEditing(null)
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col">
      <header className="h-header-safe flex items-center px-2 bg-stone-100 border-b border-stone-200 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-stone-600">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 text-center">
          <div className="text-[15px] text-stone-700">场景 · {character.name}</div>
          <button
            onClick={() => setShowTimeMenu(!showTimeMenu)}
            data-tour="scene-time"
            className="text-[11px] text-stone-400 flex items-center gap-1 mx-auto hover:text-stone-600"
          >
            <Clock size={11} />
            {formatFull(sceneTime)}
            {!isSolo && <span className="text-amber-500">（全局）</span>}
          </button>
        </div>
        <button
          onClick={() => navigate(`/chat/${chat.id}`)}
          className="p-2 -mr-2 text-stone-600"
          title="返回微信聊天"
        >
          <MessageCircle size={20} />
        </button>

        {/* 手动控时菜单 */}
        {showTimeMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowTimeMenu(false)} />
            <div className="absolute left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+44px)] bg-white shadow-lg rounded border border-stone-200 z-20 text-[13px] py-1 min-w-[140px]">
              {!isSolo && (
                <div className="px-3 py-2 text-[11px] text-amber-600 border-b border-stone-100">
                  仅单卡模式可手动控时
                </div>
              )}
              <button onClick={() => handleManualAdvance(30 * 60 * 1000)} className="w-full text-left px-3 py-1.5 hover:bg-stone-50">+30 分钟</button>
              <button onClick={() => handleManualAdvance(60 * 60 * 1000)} className="w-full text-left px-3 py-1.5 hover:bg-stone-50">+1 小时</button>
              <button onClick={() => handleManualAdvance(3 * 60 * 60 * 1000)} className="w-full text-left px-3 py-1.5 hover:bg-stone-50">+3 小时</button>
              <button onClick={() => handleManualAdvance(8 * 60 * 60 * 1000)} className="w-full text-left px-3 py-1.5 hover:bg-stone-50">+8 小时</button>
              <button onClick={() => handleManualAdvance(24 * 60 * 60 * 1000)} className="w-full text-left px-3 py-1.5 hover:bg-stone-50">+1 天</button>
              <button onClick={handleManualSet} className="w-full text-left px-3 py-1.5 hover:bg-stone-50 border-t border-stone-100">指定时刻...</button>
            </div>
          </>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 scrollbar-hide">
        {sceneMessages.length === 0 && !sending ? (
          <div className="text-center text-stone-400 text-[13px] mt-12 leading-relaxed">
            场景模式 · 自由叙事<br />
            <span className="text-[12px]">从这里开始写下你们的故事</span>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            {sceneMessages.map((msg) => (
              <SceneBlock
                key={msg.id}
                message={msg}
                characterName={character.name}
                characterAvatar={character.avatar}
                userName={userName}
                userAvatar={userAvatar}
                onContextMenu={(e) => { e.preventDefault(); openContextMenu(e, msg) }}
              />
            ))}

            {sending && streamingText !== null && (
              <div className="rounded-lg bg-white border border-stone-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar src={character.avatar} name={character.name} size={24} />
                  <span className="text-[12px] text-stone-500">{character.name}</span>
                  <Loader2 size={12} className="animate-spin text-stone-400" />
                </div>
                {streamingText ? <NarrativeText text={streamingText} /> : (
                  <span className="text-[13px] text-stone-400 italic">正在续写...</span>
                )}
              </div>
            )}

            {sending && streamingText === null && (
              <div className="text-[12px] text-stone-400 italic flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                正在续写...
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="max-w-2xl mx-auto mt-4 p-2 bg-red-50 text-red-600 text-[12px] rounded">{error}</div>
        )}
      </div>

      <div className="shrink-0 bg-stone-100 border-t border-stone-200 px-3 py-3 pb-safe">
        <div className="max-w-2xl mx-auto">
          {timeTip && (
            <div className="text-[12px] text-amber-600 mb-1.5 text-center">{timeTip}</div>
          )}
          <SafeTextarea
            rows={3}
            placeholder="描述你的行动或对白...（Ctrl+Enter 发送）"
            className="w-full px-3 py-2 bg-white rounded text-[14px] outline-none resize-none border border-stone-200 focus:border-stone-400"
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-4 py-1.5 bg-stone-700 text-white rounded text-[13px] disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {sending ? '...' : '推进剧情'}
            </button>
          </div>
        </div>
      </div>

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems(contextMenu.message)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editing && (
        <MessageEditDialog
          initialText={editing.content}
          onConfirm={handleEditConfirm}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SceneBlock({
  message, characterName, characterAvatar, userName, userAvatar, onContextMenu,
}: {
  message: Message
  characterName: string
  characterAvatar?: string
  userName: string
  userAvatar?: string
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const isUser = message.role === 'user'
  const longPressTimer = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    longPressTimer.current = window.setTimeout(() => {
      onContextMenu({ preventDefault: () => {}, clientX: t.clientX, clientY: t.clientY } as React.MouseEvent)
    }, 500)
  }
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  return (
    <div
      onContextMenu={onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`rounded-lg p-3 cursor-context-menu select-text ${
        isUser ? 'bg-stone-100 border border-stone-200' : 'bg-white border border-stone-200 shadow-sm'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Avatar src={isUser ? userAvatar : characterAvatar} name={isUser ? userName : characterName} size={24} />
        <span className="text-[12px] text-stone-500">{isUser ? userName : characterName}</span>
      </div>
      <NarrativeText text={message.content} />
    </div>
  )
}
