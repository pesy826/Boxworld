import { create } from 'zustand'
import { db } from '../db'
import { uuid } from '../utils/id'
import type { Chat, Message } from '../types'
import { timeService } from '../services/timeService'
import { useCharacterStore } from './characterStore'


interface ChatStore {
    chats: Chat[]
    messagesByChat: Record<string, Message[]>
    loaded: boolean

    load: () => Promise<void>
    loadMessages: (chatId: string) => Promise<void>

    getOrCreateChat: (characterId: string) => Promise<Chat>
    /** 建群（memberIds 不含用户） */
    createGroupChat: (name: string, memberIds: string[], worldId?: string) => Promise<Chat>
    /** 修改群成员 */
    updateGroupMembers: (chatId: string, memberIds: string[]) => Promise<void>
    /** 改群名 */
    renameGroup: (chatId: string, name: string) => Promise<void>

    appendUserMessage: (chatId: string, content: string) => Promise<Message>
    /** 用户发表情（content = 表情描述名） */
    appendUserSticker: (chatId: string, desc: string) => Promise<Message>
    /** 用户发图片（imageData = 图片 dataURL；content = 可选的中文描述） */
    appendUserImage: (chatId: string, imageData: string, content?: string) => Promise<Message>
    appendAssistantMessages: (
        chatId: string,
        messages: Array<{ type: Message['type']; content: string; mood?: string; sceneHint?: string | null }>
    ) => Promise<Message[]>
    appendSystemNotice: (chatId: string, content: string) => Promise<Message>

    /** 场景模式：用户的叙事输入 */
    appendUserSceneNarrative: (chatId: string, content: string) => Promise<Message>
    /** 场景模式：AI 的叙事输出 */
    appendAssistantSceneNarrative: (chatId: string, content: string) => Promise<Message>
    /** 用指定 batchId 追加单条角色消息（供调度器逐条分发时保持同批；群聊带 senderId；图片消息带 imageData） */
    appendAssistantMessageWithBatch: (
        chatId: string,
        item: { type: Message['type']; content: string; mood?: string; sceneHint?: string | null; senderId?: string; imageData?: string },
        batchId: string,
    ) => Promise<Message>

    updateMessageContent: (messageId: string, content: string) => Promise<void>
    deleteMessage: (chatId: string, messageId: string) => Promise<void>
    deleteBatch: (chatId: string, batchId: string) => Promise<void>
    deleteFromMessage: (chatId: string, messageId: string) => Promise<void>
    clearMessages: (chatId: string) => Promise<void>
    deleteChat: (chatId: string) => Promise<void>
    markRead: (chatId: string) => Promise<void>
}

export const useChatStore = create<ChatStore>((set, get) => ({
    chats: [],
    messagesByChat: {},
    loaded: false,

    load: async () => {
        const list = await db.chats.orderBy('lastMessageAt').reverse().toArray()
        list.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
            return b.lastMessageAt - a.lastMessageAt
        })
        set({ chats: list, loaded: true })
    },

    loadMessages: async (chatId) => {
        const list = await db.messages.where('chatId').equals(chatId).toArray()
        list.sort((a, b) => a.sequence - b.sequence)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: list },
        }))
    },

    getOrCreateChat: async (characterId) => {
        const existing = get().chats.find((c) => c.characterId === characterId && (c.type ?? 'single') === 'single')
        if (existing) return existing

        const now = timeService.now()

        const chat: Chat = {
            id: uuid(),
            characterId,
            lastMessageAt: now,
            lastMessagePreview: '',
            unreadCount: 0,
            pinned: false,
            lastCharacterActiveAt: now,
        }
        await db.chats.add(chat)
        set((s) => ({ chats: [chat, ...s.chats] }))
        return chat
    },

    createGroupChat: async (name, memberIds, worldId) => {
        const now = timeService.now()
        const chat: Chat = {
            id: uuid(),
            characterId: '',
            lastMessageAt: now,
            lastMessagePreview: '',
            unreadCount: 0,
            pinned: false,
            lastCharacterActiveAt: now,
            type: 'group',
            name,
            memberIds: [...memberIds],
            worldId,
        }
        await db.chats.add(chat)
        set((s) => ({ chats: [chat, ...s.chats] }))
        return chat
    },

    updateGroupMembers: async (chatId, memberIds) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat) return
        const next = { ...chat, memberIds: [...memberIds] }
        await db.chats.put(next)
        set((s) => ({ chats: s.chats.map((c) => c.id === chatId ? next : c) }))
    },

    renameGroup: async (chatId, name) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat) return
        const next = { ...chat, name }
        await db.chats.put(next)
        set((s) => ({ chats: s.chats.map((c) => c.id === chatId ? next : c) }))
    },

    appendUserMessage: async (chatId, content) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq, role: 'user', type: 'text', content,
            timestamp: chatNow(chatId),
        }
        await db.messages.add(msg)
        await updateChatAfterMessage(chatId, content, msg.timestamp, false)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        await get().load()
        return msg
    },

    appendUserSticker: async (chatId, desc) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq, role: 'user', type: 'sticker', content: desc,
            timestamp: chatNow(chatId),
        }
        await db.messages.add(msg)
        await updateChatAfterMessage(chatId, `[表情]`, msg.timestamp, false)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        await get().load()
        return msg
    },

    appendUserImage: async (chatId, imageData, content) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq, role: 'user', type: 'image',
            content: content || '', imageData,
            timestamp: chatNow(chatId),
        }
        await db.messages.add(msg)
        await updateChatAfterMessage(chatId, '[图片]', msg.timestamp, false)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        await get().load()
        return msg
    },

    appendAssistantMessages: async (chatId, items) => {
        if (items.length === 0) return []
        const batchId = uuid()
        const baseSeq = await nextSequence(chatId)
        const baseTs = chatNow(chatId)
        const messages: Message[] = items.map((item, i) => ({
            id: uuid(), chatId, sequence: baseSeq + i,
            role: 'assistant', type: item.type, content: item.content,
            timestamp: baseTs + i, batchId, mood: item.mood, sceneHint: item.sceneHint ?? null,
        }))
        await db.messages.bulkAdd(messages)
        const last = messages[messages.length - 1]
        await updateChatAfterMessage(chatId, last.content, last.timestamp, true)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), ...messages] },
        }))
        await get().load()
        return messages
    },

    appendAssistantMessageWithBatch: async (chatId, item, batchId) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq,
            role: 'assistant', type: item.type, content: item.content,
            timestamp: chatNow(chatId), batchId,
            mood: item.mood, sceneHint: item.sceneHint ?? null,
            senderId: item.senderId,
            imageData: item.imageData,
        }
        await db.messages.add(msg)
        await updateChatAfterMessage(chatId, item.type === 'image' ? '[图片]' : item.content, msg.timestamp, true)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        await get().load()
        return msg
    },

    appendSystemNotice: async (chatId, content) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq, role: 'system', type: 'system_notice', content,
            timestamp: chatNow(chatId),
        }
        await db.messages.add(msg)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        return msg
    },

    appendUserSceneNarrative: async (chatId, content) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq,
            role: 'user', type: 'scene_narrative', content,
            timestamp: chatNow(chatId),
        }
        await db.messages.add(msg)
        await updateChatAfterMessage(chatId, '[场景]', msg.timestamp, false)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        return msg
    },

    appendAssistantSceneNarrative: async (chatId, content) => {
        const nextSeq = await nextSequence(chatId)
        const msg: Message = {
            id: uuid(), chatId, sequence: nextSeq,
            role: 'assistant', type: 'scene_narrative', content,
            timestamp: chatNow(chatId),
            batchId: uuid(),
        }
        await db.messages.add(msg)
        await updateChatAfterMessage(chatId, '[场景]', msg.timestamp, true)
        set((s) => ({
            messagesByChat: { ...s.messagesByChat, [chatId]: [...(s.messagesByChat[chatId] || []), msg] },
        }))
        return msg
    },

    updateMessageContent: async (messageId, content) => {
        const target = await db.messages.get(messageId)
        if (!target) return
        const updated = { ...target, content }
        await db.messages.put(updated)
        set((s) => ({
            messagesByChat: {
                ...s.messagesByChat,
                [target.chatId]: (s.messagesByChat[target.chatId] || []).map(
                    (m) => m.id === messageId ? updated : m,
                ),
            },
        }))
    },

    deleteMessage: async (chatId, messageId) => {
        await db.messages.delete(messageId)
        set((s) => ({
            messagesByChat: {
                ...s.messagesByChat,
                [chatId]: (s.messagesByChat[chatId] || []).filter((m) => m.id !== messageId),
            },
        }))
    },

    deleteBatch: async (chatId, batchId) => {
        const toDelete = await db.messages
            .where('chatId').equals(chatId)
            .filter((m) => m.batchId === batchId)
            .toArray()
        await db.messages.bulkDelete(toDelete.map((m) => m.id))
        const idsSet = new Set(toDelete.map((m) => m.id))
        set((s) => ({
            messagesByChat: {
                ...s.messagesByChat,
                [chatId]: (s.messagesByChat[chatId] || []).filter((m) => !idsSet.has(m.id)),
            },
        }))
    },

    deleteFromMessage: async (chatId, messageId) => {
        const all = get().messagesByChat[chatId] || []
        const target = all.find((m) => m.id === messageId)
        if (!target) return
        const toDelete = all.filter((m) => m.sequence >= target.sequence)
        await db.messages.bulkDelete(toDelete.map((m) => m.id))
        set((s) => ({
            messagesByChat: {
                ...s.messagesByChat,
                [chatId]: (s.messagesByChat[chatId] || []).filter((m) => m.sequence < target.sequence),
            },
        }))
    },

    clearMessages: async (chatId) => {
        await db.messages.where('chatId').equals(chatId).delete()
        set((s) => ({ messagesByChat: { ...s.messagesByChat, [chatId]: [] } }))
    },

    deleteChat: async (chatId) => {
        await db.transaction('rw', db.chats, db.messages, async () => {
            await db.chats.delete(chatId)
            await db.messages.where('chatId').equals(chatId).delete()
        })
        set((s) => {
            const next = { ...s.messagesByChat }
            delete next[chatId]
            return {
                chats: s.chats.filter((c) => c.id !== chatId),
                messagesByChat: next,
            }
        })
    },

    markRead: async (chatId) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat || chat.unreadCount === 0) return
        const next = { ...chat, unreadCount: 0 }
        await db.chats.put(next)
        set((s) => ({ chats: s.chats.map((c) => c.id === chatId ? next : c) }))
    },
}))

async function nextSequence(chatId: string): Promise<number> {
    const maxMsg = await db.messages
        .where('chatId').equals(chatId)
        .reverse().sortBy('sequence')
        .then((arr) => arr[0])
    return (maxMsg?.sequence || 0) + 1
}

/** 取某 chat 对应角色的有效时间（单卡用独立时间，否则全局；群聊用所属世界主卡时间） */
function chatNow(chatId: string): number {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId)
    if (!chat) return timeService.now()
    if (chat.type === 'group') {
        if (chat.worldId) {
            const worldChar = useCharacterStore.getState().getById(chat.worldId)
            return timeService.nowForCharacter(worldChar)
        }
        return timeService.now()
    }
    const char = useCharacterStore.getState().getById(chat.characterId)
    return timeService.nowForCharacter(char)
}

async function updateChatAfterMessage(
    chatId: string,
    preview: string,
    timestamp: number,
    fromCharacter: boolean,
) {
    const chat = await db.chats.get(chatId)
    if (!chat) return
    const next: Chat = {
        ...chat,
        lastMessageAt: timestamp,
        lastMessagePreview: preview.slice(0, 40),
        unreadCount: fromCharacter ? chat.unreadCount + 1 : chat.unreadCount,
        lastCharacterActiveAt: fromCharacter ? timestamp : chat.lastCharacterActiveAt,
    }
    await db.chats.put(next)
}
