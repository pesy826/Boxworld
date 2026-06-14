import { create } from 'zustand'
import { db } from '../db'
import { uuid } from '../utils/id'
import type { Moment, MomentComment } from '../types'
import { timeService } from '../services/timeService'

interface MomentStore {
  moments: Moment[]
  commentsByMoment: Record<string, MomentComment[]>
  loaded: boolean

  load: () => Promise<void>
  loadComments: (momentId: string) => Promise<void>

  addMoment: (
    m: Omit<Moment, 'id' | 'imageDescriptions' | 'imageAnalyzed'> & {
      imageDescriptions?: string[]
      imageAnalyzed?: boolean
    }
  ) => Promise<Moment>
  deleteMoment: (id: string) => Promise<void>
  updateMomentContent: (id: string, content: string) => Promise<void>
  /** 设置图片描述并标记已分析 */
  setMomentImageDescriptions: (id: string, descriptions: string[], analyzed: boolean) => Promise<void>
  toggleLike: (momentId: string, userId: string) => Promise<void>

  addComment: (momentId: string, authorId: string, content: string, replyToId?: string) => Promise<MomentComment>
  deleteComment: (commentId: string) => Promise<void>
  updateCommentContent: (commentId: string, content: string) => Promise<void>
}

export const useMomentStore = create<MomentStore>((set, get) => ({
  moments: [],
  commentsByMoment: {},
  loaded: false,

  load: async () => {
    const list = await db.moments.orderBy('timestamp').reverse().toArray()
    set({ moments: list, loaded: true })
    for (const m of list) {
      await get().loadComments(m.id)
    }
  },

  loadComments: async (momentId) => {
    const list = await db.momentComments.where('momentId').equals(momentId).toArray()
    list.sort((a, b) => a.timestamp - b.timestamp)
    set((s) => ({
      commentsByMoment: { ...s.commentsByMoment, [momentId]: list },
    }))
  },

  addMoment: async (m) => {
    const moment: Moment = {
      ...m,
      id: uuid(),
      imageDescriptions: m.imageDescriptions || [],
      imageAnalyzed: m.imageAnalyzed ?? (!m.images || m.images.length === 0),
    }
    await db.moments.add(moment)
    set((s) => ({ moments: [moment, ...s.moments].sort((a, b) => b.timestamp - a.timestamp) }))
    return moment
  },

  deleteMoment: async (id) => {
    await db.transaction('rw', db.moments, db.momentComments, async () => {
      await db.moments.delete(id)
      await db.momentComments.where('momentId').equals(id).delete()
    })
    set((s) => {
      const next = { ...s.commentsByMoment }
      delete next[id]
      return {
        moments: s.moments.filter((m) => m.id !== id),
        commentsByMoment: next,
      }
    })
  },

  updateMomentContent: async (id, content) => {
    const target = get().moments.find((m) => m.id === id)
    if (!target) return
    const updated = { ...target, content }
    await db.moments.put(updated)
    set((s) => ({ moments: s.moments.map((m) => m.id === id ? updated : m) }))
  },

  setMomentImageDescriptions: async (id, descriptions, analyzed) => {
    const target = get().moments.find((m) => m.id === id)
    if (!target) return
    const updated = { ...target, imageDescriptions: descriptions, imageAnalyzed: analyzed }
    await db.moments.put(updated)
    set((s) => ({ moments: s.moments.map((m) => m.id === id ? updated : m) }))
  },

  toggleLike: async (momentId, userId) => {
    const m = get().moments.find((x) => x.id === momentId)
    if (!m) return
    const likes = m.likes.includes(userId)
      ? m.likes.filter((u) => u !== userId)
      : [...m.likes, userId]
    const next = { ...m, likes }
    await db.moments.put(next)
    set((s) => ({ moments: s.moments.map((x) => x.id === momentId ? next : x) }))
  },

  addComment: async (momentId, authorId, content, replyToId) => {
    const comment: MomentComment = {
      id: uuid(),
      momentId,
      authorId,
      replyToId,
      content,
      timestamp: timeService.now(),
    }
    await db.momentComments.add(comment)
    set((s) => ({
      commentsByMoment: {
        ...s.commentsByMoment,
        [momentId]: [...(s.commentsByMoment[momentId] || []), comment],
      },
    }))
    return comment
  },

  deleteComment: async (commentId) => {
    const target = await db.momentComments.get(commentId)
    if (!target) return
    await db.momentComments.delete(commentId)
    set((s) => ({
      commentsByMoment: {
        ...s.commentsByMoment,
        [target.momentId]: (s.commentsByMoment[target.momentId] || []).filter((c) => c.id !== commentId),
      },
    }))
  },

  updateCommentContent: async (commentId, content) => {
    const target = await db.momentComments.get(commentId)
    if (!target) return
    const updated = { ...target, content }
    await db.momentComments.put(updated)
    set((s) => ({
      commentsByMoment: {
        ...s.commentsByMoment,
        [target.momentId]: (s.commentsByMoment[target.momentId] || []).map(
          (c) => c.id === commentId ? updated : c,
        ),
      },
    }))
  },
}))
