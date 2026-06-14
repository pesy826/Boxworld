import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2, ChevronDown, ChevronRight as RightIcon } from 'lucide-react'
import { usePromptDebugStore, type PromptPurpose, type PromptDebugEntry } from '../stores/promptDebugStore'

const PURPOSE_LABEL: Record<PromptPurpose, string> = {
  im_chat: '微信聊天',
  scene_chat: '场景对话',
  screening: '粗筛',
  thinking: '深思',
  scene_summary: '场景摘要',
  im_greeting_rewrite: '改写开场白',
  moment_generate: '朋友圈生成',
  comment_reply: '朋友圈回复',
  moment_summary: '朋友圈摘要',
  test: '测试',
}

const PURPOSE_COLOR: Record<PromptPurpose, string> = {
  im_chat: 'bg-wechat-green/15 text-wechat-green',
  scene_chat: 'bg-purple-100 text-purple-700',
  screening: 'bg-blue-100 text-blue-700',
  thinking: 'bg-orange-100 text-orange-700',
  scene_summary: 'bg-pink-100 text-pink-700',
  im_greeting_rewrite: 'bg-gray-100 text-gray-700',
  moment_generate: 'bg-yellow-100 text-yellow-700',
  comment_reply: 'bg-yellow-100 text-yellow-700',
  moment_summary: 'bg-yellow-100 text-yellow-700',
  test: 'bg-gray-100 text-gray-700',
}

export default function DebugPromptsPage() {
  const navigate = useNavigate()
  const entries = usePromptDebugStore((s) => s.entries)
  const clear = usePromptDebugStore((s) => s.clear)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<PromptPurpose | 'all'>('all')

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.purpose === filter)

  return (
    <div className="min-h-full bg-wechat-bg pb-8">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">Prompt 调试</h1>
        <button
          onClick={() => {
            if (confirm('清空所有调试记录？')) clear()
          }}
          className="p-2 -mr-2"
          title="清空"
        >
          <Trash2 size={18} />
        </button>
      </header>

      {/* 过滤器 */}
      <div className="bg-white p-2 border-b border-wechat-divider flex flex-wrap gap-1.5">
        <FilterChip label="全部" active={filter === 'all'} onClick={() => setFilter('all')} />
        {Object.entries(PURPOSE_LABEL).map(([key, label]) => (
          <FilterChip
            key={key}
            label={label}
            active={filter === key}
            onClick={() => setFilter(key as PromptPurpose)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
          {entries.length === 0 ? '还没有调用记录' : '该分类下没有记录'}<br />
          <span className="text-[12px]">触发任何 API 调用后会出现在这里</span>
        </div>
      ) : (
        <div className="px-2 py-2 space-y-1.5">
          {filtered.map((e) => (
            <EntryItem
              key={e.id}
              entry={e}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[12px] rounded-full ${
        active ? 'bg-wechat-green text-white' : 'bg-wechat-bg text-wechat-textGray'
      }`}
    >
      {label}
    </button>
  )
}

function EntryItem({
  entry, expanded, onToggle,
}: {
  entry: PromptDebugEntry
  expanded: boolean
  onToggle: () => void
}) {
  const time = new Date(entry.timestamp).toLocaleString('zh-CN', { hour12: false })
  const status = entry.error ? '失败' : entry.rawReply !== undefined ? '成功' : '进行中'
  const statusColor = entry.error ? 'text-red-500' : entry.rawReply !== undefined ? 'text-wechat-green' : 'text-wechat-textGray'

  return (
    <div className="bg-white rounded border border-wechat-divider overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-wechat-bg"
      >
        {expanded ? <ChevronDown size={14} /> : <RightIcon size={14} />}
        <span className={`text-[11px] px-1.5 py-0.5 rounded ${PURPOSE_COLOR[entry.purpose]}`}>
          {PURPOSE_LABEL[entry.purpose]}
        </span>
        <span className="text-[12px] text-wechat-textGray">{entry.endpoint}</span>
        {entry.characterName && (
          <span className="text-[12px] truncate">{entry.characterName}</span>
        )}
        <span className="flex-1" />
        <span className={`text-[11px] ${statusColor}`}>{status}</span>
        {entry.durationMs !== undefined && (
          <span className="text-[10px] text-wechat-textGray">{entry.durationMs}ms</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-wechat-divider bg-wechat-bg/30 p-3 space-y-3">
          <Field label={`时间 · 模型`}>
            <div className="text-[12px] text-wechat-textGray">{time} · {entry.model}</div>
          </Field>

          <Field label={`请求消息（${entry.messages.length} 条）`}>
            <div className="space-y-2">
              {entry.messages.map((m, i) => (
                <div key={i} className="bg-white rounded p-2 border border-wechat-divider/50">
                  <div className="text-[10px] text-wechat-textGray uppercase tracking-wider mb-1">
                    {m.role}
                  </div>
                  <div className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {typeof m.content === 'string'
                      ? m.content
                      : m.content
                          .map((p) => (p.type === 'text' ? p.text : '[图片]'))
                          .join('\n')}
                  </div>
                </div>
              ))}
            </div>
          </Field>

          {entry.rawReply !== undefined && (
            <Field label="原始返回">
              <div className="bg-white rounded p-2 border border-wechat-divider/50 text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed">
                {entry.rawReply || '(空)'}
              </div>
            </Field>
          )}

          {entry.error && (
            <Field label="错误">
              <div className="bg-red-50 rounded p-2 border border-red-200 text-[12px] text-red-700 whitespace-pre-wrap break-words font-mono">
                {entry.error}
              </div>
            </Field>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                const text = JSON.stringify({
                  purpose: entry.purpose,
                  model: entry.model,
                  messages: entry.messages,
                  reply: entry.rawReply,
                  error: entry.error,
                }, null, 2)
                navigator.clipboard?.writeText(text).catch(() => {})
                alert('已复制为 JSON')
              }}
              className="px-3 py-1 text-[12px] bg-white border border-wechat-divider rounded"
            >
              复制为 JSON
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-wechat-textGray mb-1">{label}</div>
      {children}
    </div>
  )
}
