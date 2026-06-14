import { db } from '../db'
import { useCharacterStore } from '../stores/characterStore'
import { isCharacterLockedForGlobal } from './soloModeService'
import type { Moment } from '../types'

const USER_ID = 'user'

function renderMoment(m: Moment): string {
  const t = new Date(m.timestamp).toLocaleString('zh-CN', { hour12: false })
  let text = `${t}\n${m.content || '(无文字)'}`
  if (m.images.length > 0) {
    const descs: string[] = []
    for (let i = 0; i < m.images.length; i++) {
      const d = m.imageDescriptions?.[i]
      if (d && !d.startsWith('[图片：')) descs.push(`[图：${d}]`)
    }
    if (descs.length > 0) text += '\n' + descs.join('\n')
    else text += '\n[含图片]'
  }
  return text
}

/**
 * 取"该角色能看到的用户朋友圈"。
 * 规则：
 * - 该角色被锁定（独立时间超前）：看不到任何全局朋友圈，只能看属于它自己单卡世界的
 * - 否则：能看到 public 朋友圈 + 属于它自己单卡世界的 solo 朋友圈
 */
async function getVisibleUserMoments(characterId: string): Promise<Moment[]> {
  const char = useCharacterStore.getState().getById(characterId)
  // 锁定判断走全局视角（含激活世界豁免、NPC 跟随主卡）
  const locked = isCharacterLockedForGlobal(characterId)
  // NPC 所属世界 = 主卡 id；主卡所属世界 = 自己的 id
  const worldId = char?.isNpc ? char.parentWorldId : characterId

  const all = await db.moments.where('authorId').equals(USER_ID).reverse().sortBy('timestamp')

  return all.filter((m) => {
    if (m.visibility === 'solo') {
      // 单卡世界朋友圈：只有属于这张卡所在世界的能看（NPC 跟随主卡世界）
      return m.soloWorldCharacterId === worldId
    }
    // public 朋友圈：锁定的卡看不到，未锁定的能看
    return !locked
  })
}

export async function buildUserMomentsText(
  characterId: string,
  opts: {
    summaryEnabled: boolean
    summaryThreshold: number
    recentWhenSummarized: number
    maxRecent: number
  },
): Promise<string> {
  const userMoments = await getVisibleUserMoments(characterId)
  if (userMoments.length === 0) return ''

  if (opts.summaryEnabled && userMoments.length > opts.summaryThreshold) {
    const summary = await db.momentSummaries
      .where('scope').equals('user_moments')
      .and((s) => s.ownerId === USER_ID)
      .first()
    const recent = userMoments.slice(0, opts.recentWhenSummarized)
    const parts: string[] = []
    if (summary?.content) {
      parts.push('（历史摘要）\n' + summary.content)
    }
    parts.push('（最近动态）')
    for (const m of recent) parts.push(renderMoment(m))
    return parts.join('\n\n')
  }

  const recent = userMoments.slice(0, opts.maxRecent)
  return recent.map(renderMoment).join('\n\n')
}

export async function buildCharacterMomentsText(characterId: string, maxRecent: number): Promise<string> {
  const ms = await db.moments.where('authorId').equals(characterId).reverse().sortBy('timestamp')
  if (ms.length === 0) return ''
  return ms.slice(0, maxRecent).map(renderMoment).join('\n\n')
}

export async function buildMomentInteractionsText(characterId: string): Promise<string> {
  const ms = await db.moments.where('authorId').equals(characterId).reverse().sortBy('timestamp')
  if (ms.length === 0) return ''

  const lines: string[] = []
  for (const m of ms.slice(0, 10)) {
    const comments = await db.momentComments.where('momentId').equals(m.id).toArray()
    comments.sort((a, b) => a.timestamp - b.timestamp)

    const interactions: string[] = []
    if (m.likes.length > 0) {
      const likeNames = m.likes.map((id) => (id === USER_ID ? '用户' : '某角色')).join('、')
      interactions.push(`${likeNames} 点了赞`)
    }
    for (const c of comments) {
      const who = c.authorId === characterId ? '我' : c.authorId === USER_ID ? '用户' : '某人'
      interactions.push(`${who}评论：${c.content}`)
    }

    if (interactions.length > 0) {
      const lastNonSelf = [...comments].reverse().find((c) => c.authorId !== characterId)
      const replied = lastNonSelf
        ? comments.some((c) => c.authorId === characterId && c.timestamp > lastNonSelf.timestamp)
        : true
      const status = lastNonSelf && !replied ? '（待我回复）' : ''
      lines.push(`· 我发的"${m.content.slice(0, 20)}"${status}\n  ${interactions.join('；')}`)
    }
  }

  return lines.join('\n')
}
