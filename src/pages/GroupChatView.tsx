import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, MoreHorizontal, Send, RefreshCw, Smile } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  getGroupScheduler, disposeGroupScheduler, type GroupSchedulerStatus,
} from '../services/groupChatService'
import { SafeTextarea } from '../components/SafeTextarea'
import Avatar from '../components/Avatar'
import MessageContextMenu, { type MenuItem } from '../components/MessageContextMenu'
import MessageEditDialog from '../components/MessageEditDialog'
import StickerImage from '../components/StickerImage'
import StickerPanel from '../components/StickerPanel'
import ImageLightbox from '../components/ImageLightbox'
import { formatTime, formatDate } from '../utils/time'
import { useVirtualTime } from '../services/useVirtualTime'
import type { Chat, Message } from '../types'

export default function GroupChatView({ chat }: { chat: Chat }) {
  const navigate = useNavigate()
  const messagesMap = useChatStore((s) => s.messagesByChat)
  const allMessages = messagesMap[chat.id] || []
  const messages = allMessages.filter((m) => m.type !== 'scene_narrative')
  const loadMessages = useChatStore((s) => s.loadMessages)
  const markRead = useChatStore((s) => s.markRead)
  const getCharacter = useCharacterStore((s) => s.getById)
  useVirtualTime()

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    message: Message
  } | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)

  const [status, setStatus] = useState<GroupSchedulerStatus>({
    bufferingUserInput: false,
    awaitingResponse: false,
    deliveringAssistant: false,
  })

  useEffect(() => {
    ; (async () => {
      await loadMessages(chat.id)
      await markRead(chat.id)
    })()
  }, [chat.id, loadMessages, markRead])

  useEffect(() => {
    const scheduler = getGroupScheduler(chat.id)
    const update = () => setStatus(scheduler.getStatus())
    update()
    const unsub = scheduler.subscribe(update)
    return () => { unsub() }
  }, [chat.id])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, status.awaitingResponse, status.deliveringAssistant])

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setError(null)
    await getGroupScheduler(chat.id).submitUserMessage(text)
  }

  const handleSendSticker = async (desc: string) => {
    setError(null)
    await getGroupScheduler(chat.id).submitUserSticker(desc)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (v: string) => {
    setInput(v)
    getGroupScheduler(chat.id).onUserTyping()
  }

  const handleTrigger = async () => {
    setError(null)
    const r = await getGroupScheduler(chat.id).triggerRound()
    if (!r.ok && r.error !== '已取消') setError(r.error || '触发失败')
  }

  const openContextMenu = (e: { clientX: number; clientY: number }, message: Message) => {
    setContextMenu({ x: e.clientX, y: e.clientY, message })
  }

  const buildMenuItems = (msg: Message): MenuItem[] => {
    const items: MenuItem[] = []

    items.push({
      label: '复制',
      onClick: () => {
        navigator.clipboard?.writeText(msg.content).catch(() => { })
      },
    })

    items.push({
      label: '编辑',
      disabled: msg.type !== 'text',
      onClick: () => {
        if (msg.type === 'text') setEditing(msg)
      },
    })

    if (msg.role === 'assistant' && msg.batchId) {
      items.push({
        label: '重发这一轮',
        onClick: async () => {
          setError(null)
          await useChatStore.getState().deleteBatch(chat.id, msg.batchId!)
          const r = await getGroupScheduler(chat.id).triggerRound()
          if (!r.ok && r.error !== '已取消') setError(r.error || '重发失败')
        },
      })
    }

    items.push({
      label: '删除单条',
      danger: true,
      onClick: async () => {
        if (confirm('删除这一条消息？')) {
          await useChatStore.getState().deleteMessage(chat.id, msg.id)
        }
      },
    })

    if (msg.role === 'assistant' && msg.batchId) {
      const batchSize = messages.filter((m) => m.batchId === msg.batchId).length
      if (batchSize > 1) {
        items.push({
          label: `删除整批（${batchSize} 条）`,
          danger: true,
          onClick: async () => {
            if (confirm(`删除这一批 ${batchSize} 条消息？`)) {
              await useChatStore.getState().deleteBatch(chat.id, msg.batchId!)
            }
          },
        })
      }
    }

    return items
  }

  const handleEditConfirm = async (newText: string) => {
    if (!editing) return
    await useChatStore.getState().updateMessageContent(editing.id, newText.trim())
    setEditing(null)
  }

  const showTypingHint = status.awaitingResponse || status.deliveringAssistant
  // 群人数 = AI 成员 + 用户自己
  const memberCount = (chat.memberIds?.length || 0) + 1

  return (
    <div className="h-full bg-wechat-bg flex flex-col">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider shrink-0 relative">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 text-center">
          <div className="text-[16px] font-medium truncate">
            {chat.name || '群聊'}（{memberCount}）
          </div>
          {showTypingHint && (
            <div className="text-[11px] text-wechat-green leading-tight">有人正在输入...</div>
          )}
        </div>
        <div className="p-2 -mr-2 relative">
          <button onClick={() => setShowMenu(!showMenu)} aria-label="更多" className="block">
            <MoreHorizontal size={22} />
          </button>
          {showMenu && (
            <GroupMenu
              chat={chat}
              onClose={() => setShowMenu(false)}
              onClearMessages={async () => {
                if (confirm('清空所有消息？')) {
                  await useChatStore.getState().clearMessages(chat.id)
                  getGroupScheduler(chat.id).reset()
                }
                setShowMenu(false)
              }}
              onDeleteGroup={async () => {
                if (confirm('解散并删除该群聊？')) {
                  disposeGroupScheduler(chat.id)
                  await useChatStore.getState().deleteChat(chat.id)
                  navigate('/chats', { replace: true })
                }
              }}
            />
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 scrollbar-hide">
        <GroupMessageList
          messages={messages}
          getCharacter={getCharacter}
          onMessageContextMenu={openContextMenu}
          onAvatarClick={(senderId) => navigate(`/character/${senderId}`)}
        />
        {error && (
          <div className="mx-2 mt-2 p-2 bg-red-50 text-red-600 text-[12px] rounded">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-wechat-nav border-t border-wechat-divider px-2 py-2 pb-safe">
        <div className="flex items-end gap-2">
          <button
            onClick={handleTrigger}
            disabled={status.awaitingResponse}
            title="让群里成员说话"
            className="shrink-0 w-9 h-9 flex items-center justify-center text-wechat-textGray disabled:opacity-40"
          >
            <RefreshCw size={18} className={status.awaitingResponse ? 'animate-spin' : ''} />
          </button>
          <SafeTextarea
            rows={1}
            placeholder="说点什么..."
            className="flex-1 max-h-[120px] px-3 py-2 bg-white rounded text-[14px] outline-none resize-none"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowStickers(false)}
            style={{ minHeight: 36 }}
          />
          <button
            onClick={() => setShowStickers((v) => !v)}
            title="发表情"
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded ${showStickers ? 'text-wechat-green' : 'text-wechat-textGray'}`}
          >
            <Smile size={20} />
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="shrink-0 px-3 h-9 bg-wechat-green text-white rounded text-[14px] disabled:opacity-50 flex items-center gap-1"
          >
            <Send size={14} />
            发送
          </button>
        </div>
      </div>
      {showStickers && (
        <div className="shrink-0">
          <StickerPanel onPick={handleSendSticker} />
        </div>
      )}

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

function GroupMessageList({
  messages, getCharacter, onMessageContextMenu, onAvatarClick,
}: {
  messages: Message[]
  getCharacter: (id: string) => { name: string; avatar?: string } | undefined
  onMessageContextMenu: (e: { clientX: number; clientY: number }, msg: Message) => void
  onAvatarClick: (senderId: string) => void
}) {
  if (messages.length === 0) {
    return (
      <div className="text-center text-wechat-textGray text-[12px] mt-12">
        群聊已建立，说点什么或点左下角按钮让大家开口
      </div>
    )
  }

  const items: React.ReactNode[] = []
  let lastShownTime = 0

  for (const msg of messages) {
    if (Math.abs(msg.timestamp - lastShownTime) > 5 * 60 * 1000) {
      items.push(<TimeSeparator key={`t-${msg.id}`} timestamp={msg.timestamp} />)
      lastShownTime = msg.timestamp
    }

    if (msg.type === 'system_notice') {
      items.push(
        <div key={msg.id} className="text-center my-2">
          <span className="text-[11px] text-wechat-textGray bg-wechat-bg/80 px-2 py-1 rounded">
            {msg.content}
          </span>
        </div>,
      )
      continue
    }

    const sender = msg.senderId ? getCharacter(msg.senderId) : undefined
    items.push(
      <GroupBubble
        key={msg.id}
        message={msg}
        sender={sender}
        onAvatarClick={msg.senderId ? () => onAvatarClick(msg.senderId!) : undefined}
        onContextMenu={(e) => {
          e.preventDefault()
          onMessageContextMenu(e, msg)
        }}
      />,
    )
  }

  return <div className="space-y-2">{items}</div>
}

function TimeSeparator({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  const label = isToday ? formatTime(timestamp) : `${formatDate(timestamp)} ${formatTime(timestamp)}`
  return (
    <div className="text-center my-3">
      <span className="text-[11px] text-wechat-textGray bg-wechat-bg/80 px-2 py-1 rounded">
        {label}
      </span>
    </div>
  )
}

function GroupBubble({
  message, sender, onContextMenu, onAvatarClick,
}: {
  message: Message
  sender?: { name: string; avatar?: string }
  onContextMenu: (e: React.MouseEvent) => void
  onAvatarClick?: () => void
}) {
  const isUser = message.role === 'user'
  const isSticker = message.type === 'sticker'
  const isImage = message.type === 'image' && !!message.imageData

  const [lightbox, setLightbox] = useState<string | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartPos.current = { x: t.clientX, y: t.clientY }
    longPressTimer.current = window.setTimeout(() => {
      onContextMenu({
        preventDefault: () => { },
        clientX: t.clientX,
        clientY: t.clientY,
      } as React.MouseEvent)
    }, 500)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartPos.current.x
    const dy = t.clientY - touchStartPos.current.y
    if (Math.hypot(dx, dy) > 10) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const senderName = sender?.name || '已退群成员'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <button
          onClick={onAvatarClick}
          disabled={!onAvatarClick}
          className="shrink-0 self-start"
          title={onAvatarClick ? '查看角色详情' : undefined}
        >
          <Avatar src={sender?.avatar} name={senderName} size={36} />
        </button>
      )}
      {isUser && <UserAvatarChat />}
      <div className={`max-w-[70%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser && (
          <button
            onClick={onAvatarClick}
            disabled={!onAvatarClick}
            className="text-[11px] text-wechat-textGray mb-0.5 px-1 text-left"
          >
            {senderName}
          </button>
        )}
        <div
          className={`rounded-lg text-[14px] break-words whitespace-pre-wrap cursor-context-menu select-text ${isSticker || isImage ? 'bg-transparent' : `px-3 py-2 ${isUser ? 'bg-wechat-bubble' : 'bg-white'}`
            }`}
          onContextMenu={onContextMenu}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {isSticker ? <StickerImage desc={message.content} size={100} />
            : isImage ? (
              <img
                src={message.imageData}
                alt={message.content}
                className="max-w-[200px] rounded-lg cursor-zoom-in"
                onClick={() => message.imageData && setLightbox(message.imageData)}
              />
            )
              : message.content}
        </div>
      </div>
      {lightbox && (
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

function GroupMenu({
  chat, onClose, onClearMessages, onDeleteGroup,
}: {
  chat: Chat
  onClose: () => void
  onClearMessages: () => void
  onDeleteGroup: () => void
}) {
  const navigate = useNavigate()
  const getCharacter = useCharacterStore((s) => s.getById)
  const userName = useSettingsStore((s) => s.settings?.userPersona.name) || '我'
  const members = (chat.memberIds || []).map((id) => getCharacter(id))

  const handleRename = async () => {
    const name = prompt('修改群名：', chat.name || '')
    if (name?.trim()) {
      await useChatStore.getState().renameGroup(chat.id, name.trim())
    }
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-48 bg-white shadow-lg rounded border border-wechat-divider z-20 text-[14px]">
        <div className="px-3 py-2 border-b border-wechat-divider">
          <div className="text-[11px] text-wechat-textGray mb-1">群成员（{members.length + 1}）</div>
          <div className="flex flex-wrap gap-1">
            <span className="text-[12px] bg-wechat-green/10 text-wechat-green px-1.5 py-0.5 rounded">
              {userName}（我）
            </span>
            {members.map((m) => m && (
              <button
                key={m.id}
                onClick={() => {
                  onClose()
                  navigate(`/character/${m.id}`)
                }}
                className="text-[12px] bg-wechat-bg px-1.5 py-0.5 rounded hover:bg-wechat-divider"
                title={m.isContact === false ? '非好友，点击可查看并加为好友' : undefined}
              >
                {m.name}
                {m.isContact === false && (
                  <span className="ml-0.5 text-[10px] text-orange-500">·非好友</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleRename} className="w-full text-left px-3 py-2 hover:bg-wechat-bg">
          修改群名
        </button>
        <button onClick={onClearMessages} className="w-full text-left px-3 py-2 hover:bg-wechat-bg text-red-500">
          清空消息
        </button>
        <button onClick={onDeleteGroup} className="w-full text-left px-3 py-2 hover:bg-wechat-bg text-red-500">
          解散群聊
        </button>
      </div>
    </>
  )
}

function UserAvatarChat() {
  const userAvatar = useSettingsStore((s) => s.settings?.userPersona.avatar)
  const userName = useSettingsStore((s) => s.settings?.userPersona.name) || '我'

  if (userAvatar) {
    return <Avatar src={userAvatar} name={userName} size={36} />
  }
  return (
    <div className="w-9 h-9 shrink-0 rounded-md bg-wechat-green/60 flex items-center justify-center text-white text-sm">
      {userName.charAt(0) || '我'}
    </div>
  )
}