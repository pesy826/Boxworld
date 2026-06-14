import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2, RefreshCw, Play, Loader2 } from 'lucide-react'
import { useTickLogStore } from '../stores/tickLogStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { tick } from '../services/tickService'
import type { TickLogEntry, TickLogResult, TickLogStage } from '../types'

const STAGE_LABEL: Record<TickLogStage, string> = {
  heuristic: '启发式',
  screen: 'AI 粗筛',
  decide: '深思',
  apply: '应用',
  summary: '摘要',
}

const RESULT_COLOR: Record<TickLogResult, string> = {
  skipped: 'text-wechat-textGray',
  pass: 'text-blue-600',
  fail: 'text-red-500',
  success: 'text-wechat-green',
}

const RESULT_LABEL: Record<TickLogResult, string> = {
  skipped: '跳过',
  pass: '通过',
  fail: '失败',
  success: '成功',
}

export default function TickLogPage() {
  const navigate = useNavigate()
  const recent = useTickLogStore((s) => s.recent)
  const getRuns = useTickLogStore((s) => s.getRecentRuns)
  const clearLogs = useTickLogStore((s) => s.clear)
  const [running, setRunning] = useState(false)
  const [tickMessage, setTickMessage] = useState<string | null>(null)

  // 单卡模式：只显示当前世界相关的日志
  const activeSoloId = useSettingsStore((s) => s.settings?.activeSoloCharacterId)
  const characters = useCharacterStore((s) => s.characters)
  const soloChar = activeSoloId ? characters.find((c) => c.id === activeSoloId) : undefined

  // 重渲染 trigger
  const [_, setRefreshKey] = useState(0)
  useEffect(() => {
    setRefreshKey((x) => x + 1)
  }, [recent.length])

  const rawRuns = getRuns(20)
  const runs = (() => {
    if (!activeSoloId) return rawRuns
    // 当前世界相关角色：主卡 + 该世界 NPC
    const worldIds = new Set(
      characters
        .filter((c) => c.id === activeSoloId || (c.isNpc && c.parentWorldId === activeSoloId))
        .map((c) => c.id),
    )
    return rawRuns
      .map((run) => ({
        ...run,
        // 保留：该世界角色的条目 + 无 characterId 的全局条目（图片解析等）
        entries: run.entries.filter((e) => !e.characterId || worldIds.has(e.characterId)),
      }))
      .filter((run) => run.entries.length > 0)
  })()

  const handleManualTick = async () => {
    setRunning(true); setTickMessage(null)
    try {
      const r = await tick({ reason: 'manual', ignoreCooldown: true })
      setTickMessage(`完成：粗筛 ${r.candidates.length} 个，AI 选中 ${r.screened.length} 个`)
    } catch (e: any) {
      setTickMessage(`失败：${e?.message || e}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">补算日志</h1>
        <button onClick={clearLogs} className="p-2 -mr-2" title="清空日志">
          <Trash2 size={18} />
        </button>
      </header>

      {/* 手动触发 */}
      <div className="bg-white border-b border-wechat-divider p-3">
        <button
          onClick={handleManualTick}
          disabled={running}
          className="w-full py-2.5 bg-wechat-green text-white rounded text-[14px] font-medium disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? '运行中...' : '手动触发一次补算（忽略冷却）'}
        </button>
        {tickMessage && (
          <div className="mt-2 text-[12px] text-wechat-textGray text-center">{tickMessage}</div>
        )}
        {soloChar && (
          <div className="mt-2 text-[11px] text-orange-500 text-center">
            单卡模式：仅显示「{soloChar.name}」世界的日志，补算使用该世界时间
          </div>
        )}
      </div>

      {/* 运行记录 */}
      {runs.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
          还没有补算记录
        </div>
      ) : (
        <div className="pb-8">
          {runs.map((run) => (
            <RunBlock key={run.runId} runId={run.runId} startedAt={run.startedAt} entries={run.entries} />
          ))}
        </div>
      )}
    </div>
  )
}

function RunBlock({ runId, startedAt, entries }: { runId: string; startedAt: number; entries: TickLogEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(startedAt)
  const timeStr = date.toLocaleString('zh-CN', { hour12: false })

  const counts = {
    pass: entries.filter((e) => e.result === 'pass').length,
    success: entries.filter((e) => e.result === 'success').length,
    fail: entries.filter((e) => e.result === 'fail').length,
    skipped: entries.filter((e) => e.result === 'skipped').length,
  }

  return (
    <div className="mt-2 bg-white border-y border-wechat-divider">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-wechat-bg"
      >
        <div>
          <div className="text-[13px]">
            <span className="text-wechat-textGray">#{runId}</span>
            <span className="ml-2">{timeStr}</span>
          </div>
          <div className="text-[11px] text-wechat-textGray mt-0.5">
            通过 {counts.pass} · 成功 {counts.success} · 失败 {counts.fail} · 跳过 {counts.skipped}
          </div>
        </div>
        <span className="text-[12px] text-wechat-link">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {entries.map((e) => (
            <div
              key={e.id}
              className="text-[12px] leading-relaxed px-2 py-1.5 bg-wechat-bg/50 rounded"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-wechat-textGray">[{STAGE_LABEL[e.stage]}]</span>
                <span className={RESULT_COLOR[e.result]}>{RESULT_LABEL[e.result]}</span>
                {e.characterName && (
                  <span className="font-medium">{e.characterName}</span>
                )}
              </div>
              {e.reason && (
                <div className="mt-0.5 text-wechat-textGray">{e.reason}</div>
              )}
              {e.detail && (
                <div className="mt-0.5 text-wechat-textGray font-mono break-all">{e.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
