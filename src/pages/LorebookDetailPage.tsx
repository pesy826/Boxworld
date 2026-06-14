import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, Plus, Trash2, Pencil, GripVertical,
  ChevronDown, ChevronRight as ChevronRightIcon, Share2,
} from 'lucide-react'
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor,
    useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove, SortableContext, sortableKeyboardCoordinates,
    useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLorebookStore } from '../stores/lorebookStore'
import { SafeInput } from '../components/SafeInput'
import { SafeTextarea } from '../components/SafeTextarea'
import type { LorebookEntry } from '../types'

export default function LorebookDetailPage() {
    const { id = '' } = useParams()
    const navigate = useNavigate()
    const book = useLorebookStore((s) => s.lorebooks.find((b) => b.id === id))
    const entriesMap = useLorebookStore((s) => s.entriesByBook)
    const entries = entriesMap[id] || []
    const loadEntries = useLorebookStore((s) => s.loadEntries)
    const rename = useLorebookStore((s) => s.renameLorebook)
    const remove = useLorebookStore((s) => s.deleteLorebook)
    const createEntry = useLorebookStore((s) => s.createEntry)
    const updateEntry = useLorebookStore((s) => s.updateEntry)
    const deleteEntry = useLorebookStore((s) => s.deleteEntry)
    const reorder = useLorebookStore((s) => s.reorderEntries)

    const [expandedId, setExpandedId] = useState<string | null>(null)

    useEffect(() => {
        loadEntries(id)
    }, [id, loadEntries])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = async (e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const oldIndex = entries.findIndex((x) => x.id === active.id)
        const newIndex = entries.findIndex((x) => x.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const reordered = arrayMove(entries, oldIndex, newIndex)
        await reorder(id, reordered.map((e) => e.id))
    }

    const handleRename = async () => {
        if (!book) return
        const name = prompt('新名字：', book.name)
        if (name?.trim()) await rename(book.id, name.trim())
    }

    const handleDelete = async () => {
        if (!book) return
        if (!confirm(`删除世界书"${book.name}"？\n所有条目会一起删除，绑定该世界书的角色将解绑。`)) return
        await remove(book.id)
        navigate(-1)
    }

    if (!book) {
        return (
            <div className="min-h-full bg-wechat-bg flex flex-col">
                <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                        <ChevronLeft size={22} />
                    </button>
                </header>
                <div className="flex-1 flex items-center justify-center text-wechat-textGray">
                    世界书不存在
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-full bg-wechat-bg pb-8">
            <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                    <ChevronLeft size={22} />
                </button>
                <h1 className="text-[17px] font-semibold flex-1 text-center truncate px-2">
                    {book.name}
                </h1>
                <button
                    onClick={async () => {
                        try {
                            const { exportLorebook } = await import('../services/backupService')
                            await exportLorebook(book.id)
                        } catch (e: any) {
                            alert('导出失败：' + (e?.message || e))
                        }
                    }}
                    className="p-2"
                    title="导出"
                >
                    <Share2 size={18} />
                </button>
                <button onClick={handleRename} className="p-2" title="改名">
                    <Pencil size={18} />
                </button>

                <button onClick={handleRename} className="p-2" title="改名">
                    <Pencil size={18} />
                </button>
            </header>

            {/* 工具栏 */}
            <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-wechat-divider">
                <span className="text-[13px] text-wechat-textGray">
                    共 {entries.length} 条 · 拖拽 ☰ 调整顺序
                </span>
                <button
                    onClick={() => createEntry(id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[13px] bg-wechat-green text-white rounded-full"
                >
                    <Plus size={14} />
                    新条目
                </button>
            </div>

            {/* 条目列表 */}
            {entries.length === 0 ? (
                <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
                    还没有条目
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                        <div className="mt-2">
                            {entries.map((entry) => (
                                <SortableEntry
                                    key={entry.id}
                                    entry={entry}
                                    expanded={expandedId === entry.id}
                                    onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                                    onChange={(patch) => updateEntry(entry.id, patch)}
                                    onDelete={() => {
                                        if (confirm(`删除条目"${entry.name}"？`)) deleteEntry(entry.id)
                                    }}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {/* 危险操作 */}
            <div className="mt-6 px-4">
                <button
                    onClick={handleDelete}
                    className="w-full py-2.5 bg-white text-red-500 rounded-lg text-[14px] font-medium flex items-center justify-center gap-2"
                >
                    <Trash2 size={16} />
                    删除整本世界书
                </button>
            </div>
        </div>
    )
}

// ============ 单个条目（可拖拽 + 可展开编辑）============

interface SortableEntryProps {
    entry: LorebookEntry
    expanded: boolean
    onToggle: () => void
    onChange: (patch: Partial<LorebookEntry>) => void
    onDelete: () => void
}

function SortableEntry({ entry, expanded, onToggle, onChange, onDelete }: SortableEntryProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: entry.id,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const keysText = entry.keys.join(', ')
    const setKeys = (text: string) => {
        const arr = text.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
        onChange({ keys: arr })
    }

    return (
        <div ref={setNodeRef} style={style} className="bg-white mb-1 border-b border-wechat-divider">
            {/* 折叠头 */}
            <div className="flex items-center gap-2 px-2 py-2.5">
                <button
                    {...attributes}
                    {...listeners}
                    className="p-1 cursor-grab active:cursor-grabbing touch-none"
                    title="拖拽排序"
                >
                    <GripVertical size={16} className="text-wechat-textGray" />
                </button>

                <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(e) => onChange({ enabled: e.target.checked })}
                    className="w-4 h-4 accent-wechat-green shrink-0"
                    onClick={(e) => e.stopPropagation()}
                />

                <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
                    <div className="flex-1 min-w-0">
                        <div className={`text-[14px] truncate ${entry.enabled ? '' : 'text-wechat-textGray'}`}>
                            {entry.name || '(未命名)'}
                        </div>
                        <div className="text-[11px] text-wechat-textGray truncate">
                            {entry.constant ? '常驻' : '关键词'}
                            {' · '}
                            {positionLabel(entry)}
                            {entry.keys.length > 0 && ` · ${keysText.slice(0, 30)}${keysText.length > 30 ? '...' : ''}`}
                        </div>
                    </div>
                </button>

                <button onClick={onDelete} className="p-1.5 text-red-500" title="删除">
                    <Trash2 size={14} />
                </button>
            </div>

            {/* 展开的编辑面板 */}
            {expanded && (
                <div className="px-4 pb-3 space-y-2.5 border-t border-wechat-divider/50 pt-3 bg-wechat-bg/30">
                    <Field label="条目名">
                        <SafeInput
                            className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                            value={entry.name}
                            onChange={(v) => onChange({ name: v })}
                        />
                    </Field>

                    <Field label="关键词（逗号分隔）" hint={entry.constant ? '常驻模式下关键词忽略' : undefined}>
                        <SafeInput
                            className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                            value={keysText}
                            onChange={setKeys}
                            placeholder="如：王老板, 老王"
                        />
                    </Field>

                    <Field label="内容">
                        <SafeTextarea
                            rows={5}
                            className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none resize-none"
                            value={entry.content}
                            onChange={(v) => onChange({ content: v })}
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                        <Field label="常驻">
                            <select
                                className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                value={entry.constant ? '1' : '0'}
                                onChange={(e) => onChange({ constant: e.target.value === '1' })}
                            >
                                <option value="0">否（关键词触发）</option>
                                <option value="1">是（永远注入）</option>
                            </select>
                        </Field>

                        <Field label="角色">
                            <select
                                className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                value={entry.role}
                                onChange={(e) => onChange({ role: e.target.value as 'system' | 'user' })}
                            >
                                <option value="system">system</option>
                                <option value="user">user</option>
                            </select>
                        </Field>

                        <Field label="插入位置">
                            <select
                                className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                value={entry.position}
                                onChange={(e) => onChange({ position: e.target.value as LorebookEntry['position'] })}
                            >
                                <option value="before_char">角色定义前</option>
                                <option value="after_char">角色定义后</option>
                                <option value="at_depth">指定深度</option>
                            </select>
                        </Field>

                        {entry.position === 'at_depth' ? (
                            <Field label="深度（从 0 计）">
                                <input
                                    type="number" min="0" step="1"
                                    className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                    value={entry.depth}
                                    onChange={(e) => onChange({ depth: Math.max(0, parseInt(e.target.value) || 0) })}
                                />
                            </Field>
                        ) : (
                            <Field label="区分大小写">
                                <select
                                    className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                    value={entry.caseSensitive ? '1' : '0'}
                                    onChange={(e) => onChange({ caseSensitive: e.target.value === '1' })}
                                >
                                    <option value="0">否</option>
                                    <option value="1">是</option>
                                </select>
                            </Field>
                        )}
                    </div>

                    {entry.position === 'at_depth' && (
                        <Field label="区分大小写">
                            <select
                                className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                value={entry.caseSensitive ? '1' : '0'}
                                onChange={(e) => onChange({ caseSensitive: e.target.value === '1' })}
                            >
                                <option value="0">否</option>
                                <option value="1">是</option>
                            </select>
                        </Field>
                    )}
                </div>
            )}
        </div>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[11px] text-wechat-textGray mb-1">{label}</div>
            {children}
            {hint && <div className="text-[10px] text-wechat-textGray mt-0.5">{hint}</div>}
        </div>
    )
}

function positionLabel(e: LorebookEntry): string {
    switch (e.position) {
        case 'before_char': return '角色前'
        case 'after_char': return '角色后'
        case 'at_depth': return `深度 ${e.depth}`
    }
}
