import Dexie, { type Table } from 'dexie'
import type {
  Character, Chat, Message, Moment, MomentComment,
  ScheduledEvent, Memory, MomentSummary, SceneSummary, WorldSummary, Settings,
  Lorebook, LorebookEntry, Preset, TickLogEntry, Sticker, AvatarItem,
} from '../types'


class BoxWorldDB extends Dexie {
  characters!: Table<Character, string>
  chats!: Table<Chat, string>
  messages!: Table<Message, string>
  moments!: Table<Moment, string>
  momentComments!: Table<MomentComment, string>
  events!: Table<ScheduledEvent, string>
  memories!: Table<Memory, string>
  momentSummaries!: Table<MomentSummary, string>
  sceneSummaries!: Table<SceneSummary, string>
  settings!: Table<Settings, string>
  lorebooks!: Table<Lorebook, string>
  lorebookEntries!: Table<LorebookEntry, string>
  presets!: Table<Preset, string>
  tickLogs!: Table<TickLogEntry, string>
  worldSummaries!: Table<WorldSummary, string>
  stickers!: Table<Sticker, string>
  avatarLibrary!: Table<AvatarItem, string>


  constructor() {
    super('BoxWorldDB')

    this.version(1).stores({
      characters: 'id, name, createdAt, updatedAt',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, timestamp, role, batchId',
      moments: 'id, authorId, timestamp',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      settings: 'id',
    })

    this.version(2).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, timestamp, role, batchId',
      moments: 'id, authorId, timestamp',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
    })

    this.version(3).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, timestamp, role, batchId',
      moments: 'id, authorId, timestamp',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      await tx.table('characters').toCollection().modify((c: any) => {
        if (c.muted === undefined) c.muted = false
        if (c.lastTickAt === undefined) c.lastTickAt = 0
      })
    })

    this.version(4).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, sequence, timestamp, role, batchId, [chatId+sequence]',
      moments: 'id, authorId, timestamp',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      const messagesTable = tx.table('messages')
      const all = await messagesTable.toArray()
      const byChat = new Map<string, any[]>()
      for (const m of all) {
        const arr = byChat.get(m.chatId) || []
        arr.push(m)
        byChat.set(m.chatId, arr)
      }
      for (const [, msgs] of byChat) {
        msgs.sort((a, b) => {
          if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
          return a.id.localeCompare(b.id)
        })
        for (let i = 0; i < msgs.length; i++) msgs[i].sequence = i + 1
      }
      await messagesTable.bulkPut(all)
      console.log(`[boxworld] 已为 ${all.length} 条历史消息补 sequence`)
    })

    this.version(5).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, sequence, timestamp, role, batchId, [chatId+sequence]',
      moments: 'id, authorId, timestamp',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    })

    this.version(6).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, sequence, timestamp, role, batchId, [chatId+sequence]',
      moments: 'id, authorId, timestamp, imageAnalyzed',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      await tx.table('moments').toCollection().modify((m: any) => {
        if (!Array.isArray(m.imageDescriptions)) m.imageDescriptions = []
        if (m.imageAnalyzed === undefined) m.imageAnalyzed = !m.images || m.images.length === 0
      })
    })

    this.version(7).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt, soloModeEntered',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, sequence, timestamp, role, batchId, [chatId+sequence]',
      moments: 'id, authorId, timestamp, imageAnalyzed, visibility, soloWorldCharacterId',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      await tx.table('characters').toCollection().modify((c: any) => {
        if (c.soloModeEntered === undefined) c.soloModeEntered = false
        if (c.soloVirtualTime === undefined) c.soloVirtualTime = 0
        if (c.soloRealAnchor === undefined) c.soloRealAnchor = 0
      })
      await tx.table('moments').toCollection().modify((m: any) => {
        if (!m.visibility) m.visibility = 'public'
      })
    })

    // v8：NPC 字段
    this.version(8).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt, soloModeEntered, isNpc, parentWorldId',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, sequence, timestamp, role, batchId, [chatId+sequence]',
      moments: 'id, authorId, timestamp, imageAnalyzed, visibility, soloWorldCharacterId',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      await tx.table('characters').toCollection().modify((c: any) => {
        if (c.isNpc === undefined) c.isNpc = false
        // parentWorldId / npcRelation 主卡保持 undefined
      })
    })

    // v9：世界记忆 + 角色私有记忆
    this.version(9).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt, soloModeEntered, isNpc, parentWorldId',
      chats: 'id, characterId, lastMessageAt, pinned',
      messages: 'id, chatId, sequence, timestamp, role, batchId, [chatId+sequence]',
      moments: 'id, authorId, timestamp, imageAnalyzed, visibility, soloWorldCharacterId',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      worldSummaries: 'id, worldId, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      await tx.table('characters').toCollection().modify((c: any) => {
        if (c.privateMemory === undefined) c.privateMemory = ''
      })
    })

    // v10：群聊（chats 加 type/worldId 索引，旧数据补 type='single'）
    this.version(10).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt, soloModeEntered, isNpc, parentWorldId',
      chats: 'id, characterId, lastMessageAt, pinned, type, worldId',
      messages: 'id, chatId, sequence, timestamp, role, batchId, senderId, [chatId+sequence]',
      moments: 'id, authorId, timestamp, imageAnalyzed, visibility, soloWorldCharacterId',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      worldSummaries: 'id, worldId, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
    }).upgrade(async (tx) => {
      await tx.table('chats').toCollection().modify((c: any) => {
        if (!c.type) c.type = 'single'
      })
    })

    // v11：素材库（表情包 + 头像库）
    this.version(11).stores({
      characters: 'id, name, createdAt, updatedAt, lorebookId, muted, lastTickAt, soloModeEntered, isNpc, parentWorldId',
      chats: 'id, characterId, lastMessageAt, pinned, type, worldId',
      messages: 'id, chatId, sequence, timestamp, role, batchId, senderId, [chatId+sequence]',
      moments: 'id, authorId, timestamp, imageAnalyzed, visibility, soloWorldCharacterId',
      momentComments: 'id, momentId, authorId, timestamp',
      events: 'id, characterId, scheduledAt, status, isOffline',
      memories: 'id, characterId, timestamp, importance',
      momentSummaries: 'id, scope, ownerId, upToTimestamp',
      sceneSummaries: 'id, chatId, upToSequence, updatedAt',
      worldSummaries: 'id, worldId, updatedAt',
      settings: 'id',
      lorebooks: 'id, name, createdAt',
      lorebookEntries: 'id, lorebookId, insertionOrder, enabled',
      presets: 'id, name, mode, builtin',
      tickLogs: 'id, runId, stage, characterId, timestamp',
      stickers: 'id, desc, createdAt',
      avatarLibrary: 'id, usedBy, createdAt',
    })

  }
}

export const db = new BoxWorldDB()
