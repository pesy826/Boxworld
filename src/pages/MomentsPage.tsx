import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Camera, ImageIcon, Heart, MessageCircle, Loader2, Send, RefreshCw, X, MoreHorizontal,
} from 'lucide-react'
import { useMomentStore } from '../stores/momentStore'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useVirtualTime } from '../services/useVirtualTime'
import { formatRelative } from '../utils/time'
import { SafeInput } from '../components/SafeInput'
import { SafeTextarea } from '../components/SafeTextarea'
import MessageContextMenu, { type MenuItem } from '../components/MessageContextMenu'
import MessageEditDialog from '../components/MessageEditDialog'
import { timeService } from '../services/timeService'
import { tick } from '../services/tickService'
import { fileToCompressedDataUrl } from '../utils/image'
import Avatar from '../components/Avatar'
import { usePageTour } from '../components/TourOverlay'
import { momentsTour } from '../components/tours'
import type { Moment, MomentComment } from '../types'

const USER_ID = 'user'
const MAX_IMAGES = 9

interface ContextMenuTarget {
  x: number
  y: number
  kind: 'moment' | 'comment'
  id: string
  content: string
  isOwnedByUser: boolean
}

export default function MomentsPage() {
  const navigate = useNavigate()
  usePageTour(momentsTour)
  const moments = useMomentStore((s) => s.moments)
  const commentsMap = useMomentStore((s) => s.commentsByMoment)
  const addMoment = useMomentStore((s) => s.addMoment)
  const deleteMoment = useMomentStore((s) => s.deleteMoment)
  const updateMomentContent = useMomentStore((s) => s.updateMomentContent)
  const deleteComment = useMomentStore((s) => s.deleteComment)
  const updateCommentContent = useMomentStore((s) => s.updateCommentContent)
  const settings = useSettingsStore((s) => s.settings)
  const userName = settings?.userPersona.name || '我'
  const userAvatar = settings?.userPersona.avatar
  const now = useVirtualTime()

  const [showPost, setShowPost] = useState(false)
  const [postText, setPostText] = useState('')
  const [postVisibility, setPostVisibility] = useState<'public' | 'solo'>('public')
  const [postVisibilityTarget, setPostVisibilityTarget] = useState<string | undefined>(undefined)
  const [postImages, setPostImages] = useState<string[]>([])
  const [imageLoading, setImageLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null)
  const [editing, setEditing] = useState<{ kind: 'moment' | 'comment'; id: string; content: string } | null>(null)

  const [viewerImages, setViewerImages] = useState<string[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState(0)

  useEffect(() => {
    if (settings?.tickConfig?.autoTickOnPage) {
      tick({ reason: 'page_enter' }).catch((e) => console.warn('[moments] tick 异常:', e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleManualRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await tick({ reason: 'manual', ignoreCooldown: true })
    } finally {
      setRefreshing(false)
    }
  }

  const handlePickImages = () => {
    if (postImages.length >= MAX_IMAGES) {
      alert(`最多 ${MAX_IMAGES} 张图`)
      return
    }
    fileInputRef.current?.click()
  }

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImageLoading(true)
    try {
      const remaining = MAX_IMAGES - postImages.length
      const toProcess = Array.from(files).slice(0, remaining)
      const dataUrls: string[] = []
      for (const f of toProcess) {
        try {
          const url = await fileToCompressedDataUrl(f)
          dataUrls.push(url)
        } catch (e) {
          console.warn('[moments] 压缩图片失败:', e)
        }
      }
      setPostImages((prev) => [...prev, ...dataUrls])
    } finally {
      setImageLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = (idx: number) => {
    setPostImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const handlePublish = async () => {
    const text = postText.trim()
    if (!text && postImages.length === 0) return

    const activeSoloId = useSettingsStore.getState().settings?.activeSoloCharacterId
    // 单卡模式：默认仅本卡世界可见；全局模式：用用户选的可见范围
    const visibility = activeSoloId ? 'solo' : postVisibility
    const soloWorldCharacterId = activeSoloId || (postVisibility === 'solo' ? postVisibilityTarget : undefined)

    await addMoment({
      authorId: USER_ID,
      content: text,
      images: postImages,
      timestamp: activeSoloId ? timeService.nowForCharacter(useCharacterStore.getState().getById(activeSoloId)) : timeService.now(),
      likes: [],
      visibility,
      soloWorldCharacterId,
    })
    setPostText('')
    setPostImages([])
    setShowPost(false)
  }


  const openMomentContextMenu = (e: React.MouseEvent, moment: Moment) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      kind: 'moment', id: moment.id, content: moment.content,
      isOwnedByUser: moment.authorId === USER_ID,
    })
  }

  const openCommentContextMenu = (e: React.MouseEvent, comment: MomentComment) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      kind: 'comment', id: comment.id, content: comment.content,
      isOwnedByUser: comment.authorId === USER_ID,
    })
  }

  const buildMenu = (target: ContextMenuTarget): MenuItem[] => {
    const items: MenuItem[] = []
    items.push({
      label: '复制',
      onClick: () => navigator.clipboard?.writeText(target.content).catch(() => { }),
    })
    if (target.isOwnedByUser) {
      items.push({
        label: '编辑',
        onClick: () => setEditing({ kind: target.kind, id: target.id, content: target.content }),
      })
      items.push({
        label: '删除',
        danger: true,
        onClick: async () => {
          if (!confirm(target.kind === 'moment' ? '删除这条朋友圈（含所有评论）？' : '删除这条评论？')) return
          if (target.kind === 'moment') await deleteMoment(target.id)
          else await deleteComment(target.id)
        },
      })
    }
    return items
  }

  const handleEditConfirm = async (text: string) => {
    if (!editing) return
    const trimmed = text.trim()
    if (!trimmed) return
    if (editing.kind === 'moment') await updateMomentContent(editing.id, trimmed)
    else await updateCommentContent(editing.id, trimmed)
    setEditing(null)
  }

  const handleImageClick = (images: string[], idx: number) => {
    setViewerImages(images)
    setViewerIndex(idx)
  }

  return (
    <div className="min-h-full bg-wechat-bg pb-20">
      {/* 顶部封面 + 操作 */}
      <div className="relative bg-gradient-to-br from-slate-700 to-slate-900 pt-safe" style={{ minHeight: '180px' }}>
        <header className="h-[48px] flex items-center px-2 relative z-10">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1" />
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2 text-white"
            title="刷新"
          >
            {refreshing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
          <button onClick={() => setShowPost(!showPost)} data-tour="moment-post" className="p-2 -mr-2 text-white" title="发布">
            <Camera size={22} />
          </button>
        </header>

        {/* 用户信息：在封面底部偏下 */}
        <div className="absolute right-3 bottom-[-32px] flex items-center gap-3 z-10">
          <div className="text-white text-right">
            <div className="text-[16px] font-medium drop-shadow">{userName}</div>
          </div>
          <Avatar src={userAvatar} name={userName} size={64} className="ring-2 ring-white shadow-lg" />
        </div>
      </div>

      {/* 占位让头像不被遮挡 */}
      <div className="h-10 bg-wechat-bg" />

      {/* 发布面板 */}
      {showPost && (
        <div className="bg-white border-b border-wechat-divider p-3">
          <SafeTextarea
            rows={3}
            placeholder="这一刻的想法..."
            className="w-full p-2 text-[14px] outline-none resize-none border border-wechat-divider rounded"
            value={postText}
            onChange={setPostText}
          />

          {/* 选中的图片 */}
          {postImages.length > 0 && (
            <div className="grid grid-cols-3 gap-1 mt-2">
              {postImages.map((src, i) => (
                <div key={i} className="relative aspect-square bg-wechat-bg overflow-hidden rounded">
                  <img src={src} className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleRemoveImage(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {postImages.length < MAX_IMAGES && (
                <button
                  onClick={handlePickImages}
                  className="aspect-square border-2 border-dashed border-wechat-divider rounded flex items-center justify-center text-wechat-textGray hover:bg-wechat-bg"
                >
                  <ImageIcon size={20} />
                </button>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          <div className="flex items-center justify-between mt-2">
            <button
              onClick={handlePickImages}
              disabled={imageLoading || postImages.length >= MAX_IMAGES}
              className="text-[13px] text-wechat-textGray flex items-center gap-1 disabled:opacity-50"
            >
              {imageLoading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
              {postImages.length === 0 ? '添加图片' : `已选 ${postImages.length}/${MAX_IMAGES}`}
            </button>
            <div className="flex gap-2">
              {/* 可见范围（仅全局模式显示；单卡模式强制 solo） */}
              {!useSettingsStore.getState().settings?.activeSoloCharacterId && (
                <div className="mt-2 flex items-center gap-2 text-[12px]">
                  <span className="text-wechat-textGray">可见范围：</span>
                  <select
                    value={postVisibility}
                    onChange={(e) => setPostVisibility(e.target.value as 'public' | 'solo')}
                    className="text-[12px] border border-wechat-divider rounded px-1 py-0.5 bg-white outline-none"
                  >
                    <option value="public">公开（所有角色可见）</option>
                    <option value="solo">仅指定角色世界</option>
                  </select>
                  {postVisibility === 'solo' && (
                    <select
                      value={postVisibilityTarget || ''}
                      onChange={(e) => setPostVisibilityTarget(e.target.value || undefined)}
                      className="text-[12px] border border-wechat-divider rounded px-1 py-0.5 bg-white outline-none max-w-[120px]"
                    >
                      <option value="">选择角色...</option>
                      {useCharacterStore.getState().characters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  setShowPost(false)
                  setPostText('')
                  setPostImages([])
                }}
                className="px-3 py-1 text-[13px] text-wechat-textGray"
              >
                取消
              </button>
              <button
                onClick={handlePublish}
                disabled={!postText.trim() && postImages.length === 0}
                className="px-3 py-1 text-[13px] bg-wechat-green text-white rounded disabled:opacity-50"
              >
                发布
              </button>
            </div>
          </div>
        </div>
      )}

      {moments.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
          还没有动态<br />
          <span className="text-[12px]">点击右上角刷新或发表自己的动态</span>
        </div>
      ) : (
        <div>
          {moments.map((m) => (
            <MomentItem
              key={m.id}
              moment={m}
              comments={commentsMap[m.id] || []}
              userName={userName}
              userAvatar={userAvatar}
              now={now}
              onMomentContextMenu={openMomentContextMenu}
              onCommentContextMenu={openCommentContextMenu}
              onImageClick={handleImageClick}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenu(contextMenu)}
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

      {viewerImages && (
        <ImageViewer
          images={viewerImages}
          index={viewerIndex}
          onChangeIndex={setViewerIndex}
          onClose={() => setViewerImages(null)}
        />
      )}
    </div>
  )
}

// ============ 单条朋友圈 ============

function MomentItem({
  moment, comments, userName, userAvatar, now,
  onMomentContextMenu, onCommentContextMenu, onImageClick,
}: {
  moment: Moment
  comments: MomentComment[]
  userName: string
  userAvatar?: string
  now: number
  onMomentContextMenu: (e: React.MouseEvent, m: Moment) => void
  onCommentContextMenu: (e: React.MouseEvent, c: MomentComment) => void
  onImageClick: (images: string[], idx: number) => void
}) {
  const getCharacter = useCharacterStore((s) => s.getById)
  const toggleLike = useMomentStore((s) => s.toggleLike)
  const addComment = useMomentStore((s) => s.addComment)

  const isUser = moment.authorId === USER_ID
  const author = isUser
    ? { name: userName, avatar: userAvatar }
    : getCharacter(moment.authorId)

  const [commenting, setCommenting] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<MomentComment | null>(null)
  const [showActions, setShowActions] = useState(false)

  if (!author) return null

  const liked = moment.likes.includes(USER_ID)

  const handleComment = async () => {
    const text = commentText.trim()
    if (!text) return
    await addComment(moment.id, USER_ID, text, replyTo?.id)
    setCommentText('')
    setReplyTo(null)
    setCommenting(false)
  }

  const handleLike = () => toggleLike(moment.id, USER_ID)

  // 长按手势
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const timer = window.setTimeout(() => {
      onMomentContextMenu({
        preventDefault: () => { },
        clientX: t.clientX,
        clientY: t.clientY,
      } as React.MouseEvent, moment)
    }, 500)
    const cleanup = () => {
      clearTimeout(timer)
      e.currentTarget.removeEventListener('touchend', cleanup)
      e.currentTarget.removeEventListener('touchmove', cleanup)
    }
    e.currentTarget.addEventListener('touchend', cleanup)
    e.currentTarget.addEventListener('touchmove', cleanup)
  }

  return (
    <div className="bg-white border-b border-wechat-divider px-4 py-3">
      <div className="flex gap-3">
        <Avatar src={author.avatar} name={author.name} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-wechat-link">{author.name}</div>

          {/* 内容 */}
          {moment.content && (
            <div
              className="text-[14px] mt-1 whitespace-pre-wrap break-words cursor-context-menu select-text"
              onContextMenu={(e) => onMomentContextMenu(e, moment)}
              onTouchStart={handleTouchStart}
            >
              {moment.content}
            </div>
          )}

          {/* 图片宫格 */}
          {moment.images.length > 0 && (
            <ImageGrid
              images={moment.images}
              onClick={(idx) => onImageClick(moment.images, idx)}
            />
          )}

          {/* 底部：时间 + 操作 */}
          <div className="flex items-center justify-between mt-2 relative">
            <span className="text-[11px] text-wechat-textGray">
              {formatRelative(moment.timestamp, now)}
            </span>
            <div className="relative">
              <button
                onClick={() => setShowActions(!showActions)}
                className="px-2 py-1 bg-wechat-bg rounded text-wechat-textGray hover:bg-wechat-divider"
              >
                <MoreHorizontal size={14} />
              </button>
              {showActions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-stone-800 text-white rounded shadow-lg flex z-20 overflow-hidden">
                    <button
                      onClick={() => {
                        handleLike()
                        setShowActions(false)
                      }}
                      className="px-3 py-2 flex items-center gap-1.5 text-[13px] hover:bg-stone-700"
                    >
                      <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
                      {liked ? '取消' : '赞'}
                    </button>
                    <button
                      onClick={() => {
                        setCommenting(true)
                        setReplyTo(null)
                        setShowActions(false)
                      }}
                      className="px-3 py-2 flex items-center gap-1.5 text-[13px] hover:bg-stone-700 border-l border-stone-600"
                    >
                      <MessageCircle size={14} />
                      评论
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 点赞列表 */}
          {moment.likes.length > 0 && (
            <div className="mt-2 p-2 bg-wechat-bg/60 rounded text-[12px] text-wechat-link flex items-center gap-1.5">
              <Heart size={12} fill="currentColor" />
              <span>
                {moment.likes
                  .map((id) => (id === USER_ID ? userName : getCharacter(id)?.name || '？'))
                  .join('，')}
              </span>
            </div>
          )}

          {/* 评论列表 */}
          {comments.length > 0 && (
            <div className={`bg-wechat-bg/60 rounded p-2 space-y-1 ${moment.likes.length > 0 ? 'mt-1' : 'mt-2'}`}>
              {comments.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  allComments={comments}
                  userName={userName}
                  onReply={(t) => {
                    setReplyTo(t)
                    setCommenting(true)
                  }}
                  onContextMenu={onCommentContextMenu}
                />
              ))}
            </div>
          )}

          {/* 评论输入 */}
          {commenting && (
            <div className="mt-2 flex gap-2">
              <SafeInput
                className="flex-1 px-2 py-1.5 text-[13px] border border-wechat-divider rounded outline-none"
                value={commentText}
                onChange={setCommentText}
                placeholder={
                  replyTo
                    ? `回复 ${getCommentAuthorName(replyTo.authorId, userName, getCharacter)}：`
                    : '评论...'
                }
                autoFocus
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim()}
                className="px-3 text-[13px] bg-wechat-green text-white rounded disabled:opacity-50 flex items-center"
              >
                <Send size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ 图片宫格 ============

function ImageGrid({ images, onClick }: { images: string[]; onClick: (idx: number) => void }) {
  if (images.length === 1) {
    return (
      <div className="mt-2 inline-block max-w-[70%]">
        <img
          src={images[0]}
          onClick={() => onClick(0)}
          className="rounded cursor-zoom-in max-h-[280px] object-cover"
        />
      </div>
    )
  }

  // 2-4 张：2x2；5-9 张：3x3
  const cols = images.length <= 4 ? 2 : 3
  const gridClass = cols === 2 ? 'grid-cols-2 max-w-[260px]' : 'grid-cols-3 max-w-[360px]'

  return (
    <div className={`mt-2 grid ${gridClass} gap-1`}>
      {images.map((src, i) => (
        <div key={i} className="aspect-square overflow-hidden rounded bg-wechat-bg">
          <img
            src={src}
            onClick={() => onClick(i)}
            className="w-full h-full object-cover cursor-zoom-in"
          />
        </div>
      ))}
    </div>
  )
}

// ============ 图片查看器 ============

function ImageViewer({
  images, index, onChangeIndex, onClose,
}: {
  images: string[]
  index: number
  onChangeIndex: (idx: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onChangeIndex(index - 1)
      if (e.key === 'ArrowRight' && index < images.length - 1) onChangeIndex(index + 1)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [index, images.length, onChangeIndex, onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-4 right-4 text-white p-2 z-10"
      >
        <X size={28} />
      </button>
      <img
        src={images[index]}
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-[13px] bg-black/40 px-3 py-1 rounded">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  )
}

// ============ 评论行 ============

function CommentRow({
  comment, allComments, userName, onReply, onContextMenu,
}: {
  comment: MomentComment
  allComments: MomentComment[]
  userName: string
  onReply: (target: MomentComment) => void
  onContextMenu: (e: React.MouseEvent, c: MomentComment) => void
}) {
  const getCharacter = useCharacterStore((s) => s.getById)
  const authorName = getCommentAuthorName(comment.authorId, userName, getCharacter)
  const replyTarget = comment.replyToId
    ? allComments.find((c) => c.id === comment.replyToId)
    : null
  const replyName = replyTarget
    ? getCommentAuthorName(replyTarget.authorId, userName, getCharacter)
    : null

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const timer = window.setTimeout(() => {
      onContextMenu({
        preventDefault: () => { },
        clientX: t.clientX,
        clientY: t.clientY,
      } as React.MouseEvent, comment)
    }, 500)
    const cleanup = () => {
      clearTimeout(timer)
      e.currentTarget.removeEventListener('touchend', cleanup)
      e.currentTarget.removeEventListener('touchmove', cleanup)
    }
    e.currentTarget.addEventListener('touchend', cleanup)
    e.currentTarget.addEventListener('touchmove', cleanup)
  }

  return (
    <div
      onClick={() => onReply(comment)}
      onContextMenu={(e) => onContextMenu(e, comment)}
      onTouchStart={handleTouchStart}
      className="block w-full text-left text-[12px] leading-relaxed hover:bg-white/50 rounded px-1 py-0.5 cursor-pointer select-text"
    >
      <span className="text-wechat-link font-medium">{authorName}</span>
      {replyName && (
        <>
          <span className="text-wechat-textGray"> 回复 </span>
          <span className="text-wechat-link font-medium">{replyName}</span>
        </>
      )}
      <span className="text-wechat-textGray">：</span>
      <span>{comment.content}</span>
    </div>
  )
}

function getCommentAuthorName(
  authorId: string,
  userName: string,
  getCharacter: (id: string) => { name: string } | undefined,
): string {
  if (authorId === USER_ID) return userName
  return getCharacter(authorId)?.name || '？'
}
