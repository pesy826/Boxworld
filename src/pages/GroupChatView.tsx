import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, MoreHorizontal, Send, RefreshCw, Smile, ChevronRight, Plus } from 'lucide-react'
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
import GroupMemberPicker from '../components/GroupMemberPicker'
import VoiceBar from '../components/VoiceBar'
import { generateMessageVoice, isTtsAvailable } from '../services/ttsService'
import { fileToDataUrl } from '../utils/image'
import ImageCropper from '../components/ImageCropper'
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
  const [showInfo, setShowInfo] = useState(false)
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

    // 转语音（文字消息 + 语音通话已启用时；气泡下方挂语音条）
    if (msg.type === 'text' && isTtsAvailable()) {
      items.push({
        label: msg.voiceData ? '重新转语音' : '转语音',
        onClick: async () => {
          setError(null)
          const r = await generateMessageVoice(msg.id, msg.content)
          if (!r.ok) setError(r.error || '转语音失败')
        },
      })
    }

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
        <div className="p-2 -mr-2">
          <button onClick={() => setShowInfo(true)} aria-label="聊天信息" className="block">
            <MoreHorizontal size={22} />
          </button>
        </div>
      </header>

      {showInfo && (
        <GroupInfoPanel
          chat={chat}
          onClose={() => setShowInfo(false)}
          onClearMessages={async () => {
            if (confirm('清空聊天记录？')) {
              await useChatStore.getState().clearMessages(chat.id)
              getGroupScheduler(chat.id).reset()
            }
          }}
          onDeleteGroup={async () => {
            if (confirm('删除并退出该群聊？')) {
              disposeGroupScheduler(chat.id)
              await useChatStore.getState().deleteChat(chat.id)
              navigate('/chats', { replace: true })
            }
          }}
        />
      )}

      <div className="flex-1 relative overflow-hidden">
        {/* 固定背景层：不随消息滚动 */}
        {chat.background && (
          <>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${chat.background})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="absolute inset-0 pointer-events-none bg-black/0 dark:bg-black/30" />
          </>
        )}
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto px-3 py-3 scrollbar-hide"
        >
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
          {isSticker ? <StickerImage desc={message.content} size={100} senderCharacterId={message.senderId} />
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
        {/* 转语音生成的语音条（挂在气泡下方，不影响原文本） */}
        {message.type === 'text' && message.voiceData && (
          <VoiceBar
            messageId={message.id}
            voiceData={message.voiceData}
            duration={message.voiceDuration}
            isUser={isUser}
          />
        )}
      </div>
      {lightbox && (
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

/** 微信式全屏「聊天信息」页（仅 UI 展示风格，功能保留：成员管理 / 改群名 / 群昵称 / 清空 / 退出） */
function GroupInfoPanel({
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
  const userAvatar = useSettingsStore((s) => s.settings?.userPersona.avatar)
  const members = (chat.memberIds || []).map((id) => getCharacter(id))
  const [showPicker, setShowPicker] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const bgInputRef = useRef<HTMLInputElement>(null)
  const [bgCropSrc, setBgCropSrc] = useState<string | null>(null)

  const handlePickBackground = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const dataUrl = await fileToDataUrl(files[0])
      setBgCropSrc(dataUrl)
    } catch {
      alert('背景图处理失败')
    }
    if (bgInputRef.current) bgInputRef.current.value = ''
  }

  const groupIds = chat.groupIds || {}
  const userGroupId = groupIds['user']?.trim() || ''
  // 聊天信息标题里的人数 = AI 成员 + 用户
  const totalCount = members.filter(Boolean).length + 1

  const goCharacter = (id: string) => { onClose(); navigate(`/character/${id}`) }

  const handleRename = async () => {
    const name = prompt('修改群聊名称：', chat.name || '')
    if (name?.trim()) await useChatStore.getState().renameGroup(chat.id, name.trim())
  }

  const handleInvite = async (ids: string[]) => {
    if (ids.length === 0) { setShowPicker(false); return }
    const next = [...(chat.memberIds || [])]
    for (const id of ids) if (!next.includes(id)) next.push(id)
    await useChatStore.getState().updateGroupMembers(chat.id, next)
    const names = ids.map((id) => getCharacter(id)?.name).filter(Boolean).join('、')
    if (names) {
      await useChatStore.getState().appendSystemNotice(chat.id, `${userName} 邀请 ${names} 加入了群聊`)
      await useChatStore.getState().loadMessages(chat.id)
    }
    getGroupScheduler(chat.id).reset()
    setShowPicker(false)
  }

  const handleKick = async (id: string) => {
    const target = getCharacter(id)
    if (!target) return
    if (!confirm(`将「${target.name}」移出群聊？`)) return
    const next = (chat.memberIds || []).filter((mid) => mid !== id)
    if (next.length < 1) { alert('群里至少要保留 1 个角色成员'); return }
    await useChatStore.getState().updateGroupMembers(chat.id, next)
    await useChatStore.getState().appendSystemNotice(chat.id, `${userName} 将 ${target.name} 移出了群聊`)
    await useChatStore.getState().loadMessages(chat.id)
    getGroupScheduler(chat.id).reset()
  }

  const handleSetMyGroupId = async () => {
    const v = prompt('我在本群的昵称（留空恢复默认）：', userGroupId)
    if (v === null) return
    const trimmed = v.trim()
    await useChatStore.getState().setGroupMemberId(chat.id, 'user', trimmed)
    const display = trimmed || userName
    await useChatStore.getState().appendSystemNotice(chat.id, `${userName} 把自己的群昵称改成了「${display}」`)
    await useChatStore.getState().loadMessages(chat.id)
    getGroupScheduler(chat.id).reset()
  }

  const Row = ({ label, value, onClick }: { label: string; value?: string; onClick?: () => void }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center px-4 py-3.5 bg-white text-left active:bg-wechat-bg/60"
    >
      <span className="text-[15px] text-black">{label}</span>
      <span className="ml-auto flex items-center gap-1 text-[14px] text-wechat-textGray max-w-[55%] truncate">
        {value}
        {onClick && <ChevronRight size={16} className="text-gray-300 shrink-0" />}
      </span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-40 bg-wechat-bg flex flex-col">
      {/* 头部 */}
      <header className="h-header-safe flex items-center px-2 bg-wechat-bg shrink-0">
        <button onClick={onClose} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 text-center text-[16px] font-medium">聊天信息（{totalCount}）</div>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
        {/* 成员九宫格 */}
        <div className="bg-white mt-2 px-4 py-4">
          <div className="grid grid-cols-5 gap-y-4 gap-x-2">
            {members.map((m) => m && (
              <div key={m.id} className="flex flex-col items-center">
                <button
                  onClick={() => editMode ? handleKick(m.id) : goCharacter(m.id)}
                  className="relative"
                >
                  <Avatar src={m.avatar} name={m.name} size={48} />
                  {editMode && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">
                      −
                    </span>
                  )}
                </button>
                <span className="mt-1 text-[11px] text-wechat-textGray truncate max-w-[56px] text-center">
                  {groupIds[m.id]?.trim() || m.name}
                </span>
              </div>
            ))}
            {/* 用户自己 */}
            <div className="flex flex-col items-center">
              <button onClick={handleSetMyGroupId}>
                <Avatar src={userAvatar} name={userName} size={48} />
              </button>
              <span className="mt-1 text-[11px] text-wechat-textGray truncate max-w-[56px] text-center">
                {userGroupId || userName}
              </span>
            </div>
            {/* 邀请成员 + 号 */}
            {!editMode && (
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setShowPicker(true)}
                  className="w-12 h-12 rounded-md border border-dashed border-gray-300 flex items-center justify-center text-gray-400"
                >
                  <Plus size={22} />
                </button>
              </div>
            )}
            {/* 移除成员 − 号 */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`w-12 h-12 rounded-md border border-dashed flex items-center justify-center ${editMode ? 'border-red-300 text-red-400' : 'border-gray-300 text-gray-400'}`}
              >
                <MoreHorizontal size={22} />
              </button>
            </div>
          </div>
          {editMode && (
            <div className="mt-3 text-center text-[11px] text-wechat-textGray">点头像移出成员，完成后再次点击右侧按钮退出</div>
          )}
        </div>

        {/* 群信息项 */}
        <div className="mt-2 divide-y divide-wechat-divider">
          <Row label="群聊名称" value={chat.name || '群聊'} onClick={handleRename} />
          <Row label="群二维码" value="" onClick={() => { }} />
          <Row label="群公告" value="未设置" onClick={() => { }} />
        </div>

        <div className="mt-2 divide-y divide-wechat-divider">
          <Row label="我在本群的昵称" value={userGroupId || userName} onClick={handleSetMyGroupId} />
          <Row label="显示群成员昵称" value="" />
        </div>

        <input
          ref={bgInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handlePickBackground(e.target.files)}
        />
        <div className="mt-2 divide-y divide-wechat-divider">
          <Row
            label="设置当前聊天背景"
            value={chat.background ? '已设置' : ''}
            onClick={() => bgInputRef.current?.click()}
          />
          {chat.background && (
            <Row
              label="恢复默认背景"
              value=""
              onClick={() => useChatStore.getState().clearChatBackground(chat.id)}
            />
          )}
          <Row label="查找聊天记录" value="" onClick={() => { }} />
        </div>

        <div className="mt-2">
          <button
            onClick={onClearMessages}
            className="w-full py-3.5 bg-white text-center text-[15px] text-black active:bg-wechat-bg/60"
          >
            清空聊天记录
          </button>
        </div>

        <div className="mt-2">
          <button
            onClick={onDeleteGroup}
            className="w-full py-3.5 bg-white text-center text-[15px] text-red-500 active:bg-wechat-bg/60"
          >
            删除并退出
          </button>
        </div>
      </div>

      {showPicker && (
        <GroupMemberPicker
          existingMemberIds={chat.memberIds || []}
          worldId={chat.worldId}
          onConfirm={handleInvite}
          onClose={() => setShowPicker(false)}
        />
      )}

      {bgCropSrc && (
        <ImageCropper
          src={bgCropSrc}
          onCancel={() => setBgCropSrc(null)}
          onConfirm={async (dataUrl) => {
            setBgCropSrc(null)
            await useChatStore.getState().setChatBackground(chat.id, dataUrl)
          }}
        />
      )}
    </div>
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