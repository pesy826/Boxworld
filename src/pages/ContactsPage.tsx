import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, UserPlus, Upload } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  parseCharacterCardFromPng,
  parseCharacterCardFromJson,
} from '../services/characterCard'
import { enterSoloMode, exitSoloMode, isCharacterLockedForGlobal } from '../services/soloModeService'
import Avatar from '../components/Avatar'
import SoloModeBanner from '../components/SoloModeBanner'
import MessageContextMenu, { type MenuItem } from '../components/MessageContextMenu'
import { usePageTour } from '../components/TourOverlay'
import { contactsTour } from '../components/tours'
import type { Character } from '../types'

export default function ContactsPage() {
  const navigate = useNavigate()
  const characters = useCharacterStore((s) => s.characters)
  usePageTour(contactsTour)
  const add = useCharacterStore((s) => s.add)
  const activeSoloId = useSettingsStore((s) => s.settings?.activeSoloCharacterId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; id: string; name: string; isNpc: boolean
  } | null>(null)

  // 根据当前模式过滤显示的角色
  const mainCharacters = characters.filter((c) => !c.isNpc)
  const worldNpcs = activeSoloId
    ? characters.filter((c) => c.isNpc && c.parentWorldId === activeSoloId && c.isContact !== false)
    : []
  const soloMainChar = activeSoloId ? characters.find((c) => c.id === activeSoloId) : undefined

  const handleImportClick = () => fileRef.current?.click()

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImporting(true)
    setImportMsg(null)
    const results: string[] = []
    for (const file of Array.from(files)) {
      try {
        let char
        if (file.name.toLowerCase().endsWith('.png')) char = await parseCharacterCardFromPng(file)
        else if (file.name.toLowerCase().endsWith('.json')) char = await parseCharacterCardFromJson(file)
        else { results.push(`✗ ${file.name}：不支持的格式`); continue }
        await add(char)
        results.push(`✓ ${char.name}`)
      } catch (e: any) {
        results.push(`✗ ${file.name}：${e?.message || e}`)
      }
    }
    setImporting(false)
    setImportMsg(results.join('\n'))
    if (fileRef.current) fileRef.current.value = ''
  }

  const openCharMenu = (e: { clientX: number; clientY: number }, c: Character) => {
    setContextMenu({ x: e.clientX, y: e.clientY, id: c.id, name: c.name, isNpc: c.isNpc })
  }

  const buildCharMenu = (id: string, name: string, isNpc: boolean): MenuItem[] => {
    const items: MenuItem[] = []
    if (!isNpc) {
      // 只有主卡能进入单卡模式
      if (activeSoloId === id) {
        items.push({ label: '退出单卡模式', onClick: async () => { await exitSoloMode() } })
      } else {
        items.push({
          label: `进入「${name}」单卡模式`,
          onClick: async () => {
            await enterSoloMode(id)
            alert(`已进入「${name}」单卡模式。\n此模式下的时间推进、发朋友圈、NPC 都只针对该角色世界。`)
          },
        })
      }
    }
    items.push({ label: '进入聊天', onClick: () => navigate(`/character/${id}`) })
    return items
  }

  const renderRow = (c: Character) => (
    <CharacterRow
      key={c.id}
      character={c}
      isSolo={activeSoloId === c.id}
      onClick={() => navigate(`/character/${c.id}`)}
      onContextMenu={openCharMenu}
    />
  )

  return (
    <div className="min-h-full bg-white">
      <header className="h-header-safe flex items-center px-4 border-b border-wechat-divider justify-between relative">
        <h1 className="text-[17px] font-semibold">通讯录</h1>
        <button onClick={() => setShowAddMenu(!showAddMenu)} data-tour="add-character" className="p-1.5 rounded hover:bg-wechat-bg" title="添加角色">
          <Plus size={22} />
        </button>
        {showAddMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
            <div className="absolute right-3 top-full mt-1 w-44 bg-white shadow-lg rounded border border-wechat-divider z-20 text-[14px]">
              <button
                onClick={() => { setShowAddMenu(false); navigate('/character-create') }}
                className="w-full flex items-center gap-2 text-left px-3 py-2.5 hover:bg-wechat-bg"
              >
                <UserPlus size={16} className="text-wechat-green" />
                新建角色
              </button>
              <button
                onClick={() => { setShowAddMenu(false); handleImportClick() }}
                className="w-full flex items-center gap-2 text-left px-3 py-2.5 hover:bg-wechat-bg border-t border-wechat-divider"
              >
                <Upload size={16} className="text-wechat-link" />
                导入角色卡（PNG/JSON）
              </button>
            </div>
          </>
        )}
      </header>

      {activeSoloId && <SoloModeBanner characterId={activeSoloId} />}

      <input ref={fileRef} type="file" accept=".png,.json" multiple className="hidden"
        onChange={(e) => handleFiles(e.target.files)} />

      {importing && <div className="px-4 py-3 text-[13px] text-wechat-textGray">导入中...</div>}
      {importMsg && (
        <div className="mx-4 my-2 p-3 bg-wechat-bg rounded text-[12px] whitespace-pre-wrap">
          {importMsg}
          <button className="block mt-2 text-wechat-link" onClick={() => setImportMsg(null)}>关闭</button>
        </div>
      )}

      {/* 单卡模式：显示主卡 + 该世界 NPC */}
      {activeSoloId ? (
        <div>
          {soloMainChar && (
            <>
              <div className="px-4 pt-3 pb-1 text-[12px] text-wechat-textGray">主角</div>
              {renderRow(soloMainChar)}
            </>
          )}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[12px] text-wechat-textGray">本世界 NPC（{worldNpcs.length}）</span>
            <button
              onClick={() => navigate(`/npc-generate/${activeSoloId}`)}
              className="text-[12px] text-wechat-green flex items-center gap-1"
            >
              <Plus size={12} />
              生成 NPC
            </button>
          </div>

          {worldNpcs.length === 0 ? (
            <div className="px-4 py-6 text-center text-wechat-textGray text-[13px]">
              还没有 NPC<br />
              <span className="text-[12px]">在该角色聊天页右上角可生成 NPC（下一步功能）</span>
            </div>
          ) : (
            worldNpcs.map(renderRow)
          )}
        </div>
      ) : (
        // 全局模式：只显示主卡
        <div>
          {mainCharacters.length === 0 && !importing && (
            <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
              还没有角色<br />
              <button className="mt-3 px-4 py-2 text-wechat-green text-[14px]" onClick={handleImportClick}>
                点击导入角色卡（PNG / JSON）
              </button>
            </div>
          )}
          {mainCharacters.map(renderRow)}
        </div>
      )}

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildCharMenu(contextMenu.id, contextMenu.name, contextMenu.isNpc)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

function CharacterRow({
  character: c, isSolo, onClick, onContextMenu,
}: {
  character: Character
  isSolo: boolean
  onClick: () => void
  onContextMenu: (e: { clientX: number; clientY: number }, c: Character) => void
}) {
  const longPressTimer = useRef<number | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const isLocked = !isSolo && isCharacterLockedForGlobal(c.id)

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartPos.current = { x: t.clientX, y: t.clientY }
    longPressTimer.current = window.setTimeout(() => {
      onContextMenu({ clientX: t.clientX, clientY: t.clientY }, c)
    }, 500)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return
    const t = e.touches[0]
    if (Math.hypot(t.clientX - touchStartPos.current.x, t.clientY - touchStartPos.current.y) > 10) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu({ clientX: e.clientX, clientY: e.clientY }, c) }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg text-left"
    >
      <Avatar src={c.avatar} name={c.name} size={44} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] truncate flex items-center gap-1.5">
          {c.name}
          {c.isNpc && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">NPC</span>
          )}
          {isSolo && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded">单卡中</span>
          )}
          {isLocked && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded">时间锁定</span>
          )}
          {c.muted && (
            <span className="text-[10px] px-1.5 py-0.5 bg-wechat-textGray/15 text-wechat-textGray rounded">静默</span>
          )}
        </div>
        {c.isNpc && c.npcRelation ? (
          <div className="text-[12px] text-wechat-textGray truncate">{c.npcRelation}</div>
        ) : c.tags.length > 0 ? (
          <div className="text-[12px] text-wechat-textGray truncate">{c.tags.slice(0, 3).join(' · ')}</div>
        ) : null}
      </div>
      <ChevronRight size={18} className="text-wechat-textGray" />
    </button>
  )
}
