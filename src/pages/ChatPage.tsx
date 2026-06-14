import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, MoreHorizontal, Send, Smile, Plus } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useCharacterStore } from '../stores/characterStore'
import { useStickerStore } from '../stores/assetStore'
import { fileToCompressedDataUrl } from '../utils/image'
import { sendGreetingIfNeeded, regenerateBatch, resetGreetingFlag } from '../services/chatService'
import { getScheduler, disposeScheduler, type SchedulerStatus } from '../services/messageScheduler'
import { SafeTextarea } from '../components/SafeTextarea'
import Avatar from '../components/Avatar'
import MessageContextMenu, { type MenuItem } from '../components/MessageContextMenu'
import MessageEditDialog from '../components/MessageEditDialog'
import StickerImage from '../components/StickerImage'
import StickerPanel from '../components/StickerPanel'
import PlusPanel from '../components/PlusPanel'
import ImageLightbox from '../components/ImageLightbox'
import { formatTime, formatDate } from '../utils/time'
import { useVirtualTime } from '../services/useVirtualTime'
import { useSettingsStore } from '../stores/settingsStore'
import type { Message } from '../types'
import { timeService } from '../services/timeService'
import { isCharacterLockedForGlobal } from '../services/soloModeService'
import { usePageTour } from '../components/TourOverlay'
import { chatTour } from '../components/tours'
import GroupChatView from './GroupChatView'


export default function ChatPage() {
    const { id = '' } = useParams()
    const chat = useChatStore((s) => s.chats.find((c) => c.id === id))

    if (chat?.type === 'group') {
        return <GroupChatView chat={chat} />
    }
    return <SingleChatView chatId={id} />
}

function SingleChatView({ chatId }: { chatId: string }) {
    const id = chatId
    const navigate = useNavigate()
    const chat = useChatStore((s) => s.chats.find((c) => c.id === id))
    const messagesMap = useChatStore((s) => s.messagesByChat)
    const allMessages = messagesMap[id] || []
    const messages = allMessages.filter((m) => m.type !== 'scene_narrative')
    const loadMessages = useChatStore((s) => s.loadMessages)
    const markRead = useChatStore((s) => s.markRead)
    const character = useCharacterStore((s) => chat ? s.getById(chat.characterId) : undefined)
    useVirtualTime()
    usePageTour(chatTour)
    const activeSoloId = useSettingsStore.getState().settings?.activeSoloCharacterId
    const isLocked = character ? isCharacterLockedForGlobal(character.id) : false




    const [input, setInput] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [showMenu, setShowMenu] = useState(false)
    const [showStickers, setShowStickers] = useState(false)
    const [showPlus, setShowPlus] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const voiceEnabled = !!useSettingsStore.getState().settings?.voiceConfig?.enabled

    const [contextMenu, setContextMenu] = useState<{
        x: number
        y: number
        message: Message
    } | null>(null)
    const [editing, setEditing] = useState<Message | null>(null)
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

    // 调度器状态
    const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus>({
        bufferingUserInput: false,
        awaitingResponse: false,
        deliveringAssistant: false,
    })

    useEffect(() => {
        if (!chat || !character) return
            ; (async () => {
                await loadMessages(chat.id)
                await sendGreetingIfNeeded(chat.id, character.id)
                await markRead(chat.id)
            })()
    }, [chat?.id, character?.id, loadMessages, markRead])

    // 订阅调度器状态
    useEffect(() => {
        if (!chat || !character) return
        const scheduler = getScheduler(chat.id, character.id)
        const update = () => setSchedulerStatus(scheduler.getStatus())
        update()
        const unsub = scheduler.subscribe(update)
        return () => {
            unsub()
        }
    }, [chat?.id, character?.id])

    // 离开聊天页时清理调度器（但不在这里——如果用户切走再切回还想保持状态。
    // 真正销毁是在卸载整个 App 时，或用户清空消息时。这里不做。）

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages.length, schedulerStatus.awaitingResponse, schedulerStatus.deliveringAssistant])

    if (!chat || !character) {
        return (
            <div className="min-h-full bg-wechat-bg flex flex-col">
                <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                        <ChevronLeft size={22} />
                    </button>
                </header>
                <div className="flex-1 flex items-center justify-center text-wechat-textGray">
                    会话不存在
                </div>
            </div>
        )
    }

    const handleSend = async () => {
        const text = input.trim()
        if (!text) return
        setInput('')
        setError(null)
        const scheduler = getScheduler(chat.id, character.id)
        await scheduler.submitUserMessage(text)
    }

    const handleSendSticker = async (desc: string) => {
        setError(null)
        const scheduler = getScheduler(chat.id, character.id)
        await scheduler.submitUserSticker(desc)
    }

    const handleSendImage = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        setError(null)
        try {
            const dataUrl = await fileToCompressedDataUrl(files[0], 1024, 0.85)
            const scheduler = getScheduler(chat.id, character.id)
            await scheduler.submitUserImage(dataUrl)
        } catch (e: any) {
            setError(e?.message || '图片处理失败')
        }
        if (imageInputRef.current) imageInputRef.current.value = ''
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleInputChange = (v: string) => {
        setInput(v)
        // 用户打字时延长 flush 倒计时
        if (chat && character) {
            getScheduler(chat.id, character.id).onUserTyping()
        }
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

        // 把角色发的表情/图片"添加到喜欢"（出现在发表情面板里，AI 也能复用）
        if (msg.role === 'assistant' && msg.type === 'sticker') {
            items.push({
                label: '添加到喜欢',
                onClick: async () => {
                    const ok = await useStickerStore.getState().favoriteByDesc(msg.content)
                    if (!ok) setError('这个表情不在素材库里，无法收藏')
                },
            })
        }
        if (msg.role === 'assistant' && msg.type === 'image' && msg.imageData) {
            items.push({
                label: '添加到喜欢',
                onClick: async () => {
                    const desc = msg.content?.trim() || `图片${Date.now()}`
                    await useStickerStore.getState().addImageAsFavorite(msg.imageData!, desc)
                },
            })
        }

        if (msg.role === 'assistant' && msg.batchId) {
            items.push({
                label: '重发',
                onClick: async () => {
                    setError(null)
                    // 先删 batch，再让调度器重新生成并按节奏分发
                    await useChatStore.getState().deleteBatch(chat.id, msg.batchId!)
                    const r = await getScheduler(chat.id, character.id).regenerate()
                    if (!r.ok) setError(r.error || '重发失败')
                },
            })
        }

        // 用户消息重发：删除这条之后的所有楼层（保留本条），再触发 AI 重新回复
        if (msg.role === 'user') {
            const laterMsgs = messages.filter((m) => m.sequence > msg.sequence)
            items.push({
                label: '重发',
                onClick: async () => {
                    setError(null)
                    if (laterMsgs.length > 0 && !confirm(`重发会删除这条消息之后的 ${laterMsgs.length} 条消息，并让对方重新回复，确定吗？`)) return
                    // 删掉这条之后的所有消息（本条保留），再让调度器基于历史重新生成回复
                    for (const m of laterMsgs) {
                        await useChatStore.getState().deleteMessage(chat.id, m.id)
                    }
                    const r = await getScheduler(chat.id, character.id).regenerate()
                    if (!r.ok) setError(r.error || '重发失败')
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

    // 顶部"正在输入"提示
    const showTypingHint = schedulerStatus.awaitingResponse || schedulerStatus.deliveringAssistant

    return (
        <div className="h-full bg-wechat-bg flex flex-col">
            <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider shrink-0 relative">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                    <ChevronLeft size={22} />
                </button>
                <button
                    onClick={() => navigate(`/character/${character.id}`)}
                    className="flex-1 text-center"
                >
                    <div className="text-[16px] font-medium truncate">{character.name}</div>
                    {showTypingHint && (
                        <div className="text-[11px] text-wechat-green leading-tight">对方正在输入...</div>
                    )}
                </button>
                <div className="p-2 -mr-2 relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        aria-label="更多"
                        data-tour="chat-menu"
                        className="block"
                    >
                        <MoreHorizontal size={22} />
                    </button>
                    {showMenu && (
                        <ChatMenu
                            onClose={() => setShowMenu(false)}
                            onGoCharacter={() => navigate(`/character/${character.id}`)}
                            onGoScene={() => {
                                setShowMenu(false)
                                navigate(`/scene/${chat.id}`)
                            }}
                            onClearMessages={async () => {
                                if (confirm('清空所有消息？')) {
                                    await useChatStore.getState().clearMessages(chat.id)
                                    resetGreetingFlag(chat.id)
                                    disposeScheduler(chat.id)
                                }
                            }}
                        />
                    )}
                </div>
            </header>
            {isLocked && (
                <div className="bg-red-500 text-white px-4 py-2 text-[12px] text-center shrink-0">
                    ⚠️ 该角色处于时间锁定状态（独立时间线超前于全局）<br />
                    现在聊天可能导致剧情错乱，建议等全局时间追上后再聊
                </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 scrollbar-hide">
                <MessageList
                    messages={messages}
                    character={character}
                    onMessageContextMenu={openContextMenu}
                    onImageClick={(src) => setLightboxSrc(src)}
                />
                {error && (
                    <div className="mx-2 mt-2 p-2 bg-red-50 text-red-600 text-[12px] rounded">
                        {error}
                    </div>
                )}
            </div>
            <div className="shrink-0 bg-wechat-nav border-t border-wechat-divider px-2 py-2 pb-safe">
                <div className="flex items-end gap-2">
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
                        onClick={() => { setShowStickers((v) => !v); setShowPlus(false) }}
                        title="发表情"
                        className={`shrink-0 w-9 h-9 flex items-center justify-center rounded ${showStickers ? 'text-wechat-green' : 'text-wechat-textGray'}`}
                    >
                        <Smile size={20} />
                    </button>
                    <button
                        onClick={() => { setShowPlus((v) => !v); setShowStickers(false) }}
                        title="更多"
                        className={`shrink-0 w-9 h-9 flex items-center justify-center rounded ${showPlus ? 'text-wechat-green' : 'text-wechat-textGray'}`}
                    >
                        <Plus size={20} />
                    </button>
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleSendImage(e.target.files)}
                    />
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
            {showPlus && (
                <div className="shrink-0">
                    <PlusPanel
                        onPickImage={() => { setShowPlus(false); imageInputRef.current?.click() }}
                        onVoiceCall={() => { setShowPlus(false); navigate(`/voice-call/${chat.id}`) }}
                        voiceEnabled={voiceEnabled}
                    />
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

            {lightboxSrc && (
                <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
            )}
        </div>
    )
}

function MessageList({
    messages, character, onMessageContextMenu, onImageClick,
}: {
    messages: Message[]
    character: { name: string; avatar?: string }
    onMessageContextMenu: (e: { clientX: number; clientY: number }, msg: Message) => void
    onImageClick: (src: string) => void
}) {
    if (messages.length === 0) {
        return (
            <div className="text-center text-wechat-textGray text-[12px] mt-12">
                开始聊天吧
            </div>
        )
    }

    const items: React.ReactNode[] = []
    let lastShownTime = 0

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        if (Math.abs(msg.timestamp - lastShownTime) > 5 * 60 * 1000) {
            items.push(<TimeSeparator key={`t-${msg.id}`} timestamp={msg.timestamp} />)
            lastShownTime = msg.timestamp
        }

        if (msg.type === 'system_notice') {
            items.push(
                <SystemNotice
                    key={msg.id}
                    content={msg.content}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        onMessageContextMenu(e, msg)
                    }}
                />,
            )
            continue
        }

        items.push(
            <MessageBubble
                key={msg.id}
                message={msg}
                character={character}
                onContextMenu={(e) => {
                    e.preventDefault()
                    onMessageContextMenu(e, msg)
                }}
                onImageClick={onImageClick}
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

function SystemNotice({
    content, onContextMenu,
}: {
    content: string
    onContextMenu: (e: React.MouseEvent) => void
}) {
    return (
        <div className="text-center my-2">
            <span
                className="text-[11px] text-wechat-textGray bg-wechat-bg/80 px-2 py-1 rounded cursor-context-menu"
                onContextMenu={onContextMenu}
            >
                {content}
            </span>
        </div>
    )
}

function MessageBubble({
    message, character, onContextMenu, onImageClick,
}: {
    message: Message
    character: { name: string; avatar?: string }
    onContextMenu: (e: React.MouseEvent) => void
    onImageClick: (src: string) => void
}) {
    const isUser = message.role === 'user'
    const isSticker = message.type === 'sticker'
    const isImage = message.type === 'image' && !!message.imageData

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

    return (
        <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {!isUser && <Avatar src={character.avatar} name={character.name} size={36} />}
            {isUser && <UserAvatarChat />}
            <div className={`max-w-[70%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                    className={`rounded-lg text-[14px] break-words whitespace-pre-wrap cursor-context-menu select-text ${isSticker || isImage ? 'bg-transparent' : `px-3 py-2 ${isUser ? 'bg-wechat-bubble' : 'bg-white'}`
                        }`}
                    onContextMenu={onContextMenu}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                >
                    {isSticker ? <StickerImage desc={message.content} size={110} />
                        : isImage ? (
                            <img
                                src={message.imageData}
                                alt={message.content}
                                className="max-w-[200px] rounded-lg cursor-zoom-in"
                                onClick={() => message.imageData && onImageClick(message.imageData)}
                            />
                        )
                            : message.content}
                </div>
            </div>
        </div>
    )
}

function ChatMenu({
    onClose, onGoCharacter, onGoScene, onClearMessages,
}: {
    onClose: () => void
    onGoCharacter: () => void
    onGoScene: () => void
    onClearMessages: () => void
}) {
    return (
        <>
            <div className="fixed inset-0 z-10" onClick={onClose} />
            <div className="absolute right-0 top-full mt-1 w-40 bg-white shadow-lg rounded border border-wechat-divider z-20 text-[14px]">
                <MenuRow onClick={onGoCharacter}>角色详情</MenuRow>
                <MenuRow onClick={onGoScene}>切换到场景模式</MenuRow>
                <MenuRow onClick={onClearMessages} danger>清空消息</MenuRow>
            </div>
        </>
    )
}

function MenuRow({
    onClick, children, danger,
}: {
    onClick: () => void
    children: React.ReactNode
    danger?: boolean
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2 hover:bg-wechat-bg ${danger ? 'text-red-500' : ''}`}
        >
            {children}
        </button>
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
