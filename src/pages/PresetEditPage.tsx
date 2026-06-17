import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, Plus, Trash2, GripVertical,
  ChevronDown, ChevronRight as ChevronRightIcon, Copy, Share2,
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
import { usePresetStore } from '../stores/presetStore'
import { SafeInput } from '../components/SafeInput'
import { SafeTextarea } from '../components/SafeTextarea'
import { uuid } from '../utils/id'
import type { PromptSlot, SlotRole } from '../types'

const ROLE_LABELS: Record<SlotRole, string> = {
    static: '静态文本',
    jailbreak: '越狱/最终指令',
    char_description: '角色描述',
    char_personality: '角色性格',
    char_scenario: '场景设定',
    char_mes_example: '对话示例',
    char_system_prompt: '角色卡 System',
    char_post_history: '历史后指令',
    lorebook_before: '世界书（前）',
    lorebook_after: '世界书（后）',
    history: '历史消息',
    user_persona: '用户人设',
    user_moments: '用户朋友圈',
    character_moments: '角色自己的朋友圈',
    moment_interactions: '朋友圈互动记录',
    scene_summary: '场景模式回忆',
    private_memory: '角色私有记忆',
}

const ROLE_OPTIONS: SlotRole[] = [
    'static', 'user_persona', 'char_system_prompt',
    'char_description', 'char_personality', 'char_scenario',
    'lorebook_before', 'scene_summary', 'private_memory',
    'user_moments', 'character_moments', 'moment_interactions',
    'char_mes_example', 'history',
    'lorebook_after', 'char_post_history', 'jailbreak',
]


export default function PresetEditPage() {
    const { id = '' } = useParams()
    const navigate = useNavigate()
    const preset = usePresetStore((s) => s.presets.find((p) => p.id === id))
    const updateSlots = usePresetStore((s) => s.updateSlots)
    const updateSlot = usePresetStore((s) => s.updateSlot)
    const addSlot = usePresetStore((s) => s.addSlot)
    const removeSlot = usePresetStore((s) => s.removeSlot)
    const rename = usePresetStore((s) => s.rename)
    const remove = usePresetStore((s) => s.remove)
    const create = usePresetStore((s) => s.create)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    if (!preset) {
        return (
            <div className="min-h-full bg-wechat-bg flex flex-col">
                <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                        <ChevronLeft size={22} />
                    </button>
                </header>
                <div className="flex-1 flex items-center justify-center text-wechat-textGray">
                    预设不存在
                </div>
            </div>
        )
    }

    const isUtility = preset.mode === 'utility'

    const handleDragEnd = async (e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const oldIndex = preset.slots.findIndex((s) => s.id === active.id)
        const newIndex = preset.slots.findIndex((s) => s.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        await updateSlots(preset.id, arrayMove(preset.slots, oldIndex, newIndex))
    }

    const handleAddSlot = async () => {
        const slot: PromptSlot = {
            id: uuid(),
            name: '新槽位',
            role: 'static',
            messageRole: 'system',
            content: '',
            enabled: true,
        }
        await addSlot(preset.id, slot)
        setExpandedId(slot.id)
    }

    const handleRename = async () => {
        const name = prompt('新名字：', preset.name)
        if (name?.trim()) await rename(preset.id, name.trim())
    }

    const handleDuplicate = async () => {
        const name = prompt('复制后的名字：', `${preset.name} 副本`)
        if (!name?.trim()) return
        const copy = await create(preset.mode, name.trim(), preset, preset.utilityType)
        navigate(`/preset/${copy.id}`, { replace: true })
    }

    const handleDelete = async () => {
        if (!confirm(`删除预设"${preset.name}"？`)) return
        await remove(preset.id)
        navigate(-1)
    }

    // ============ Utility 模式：简化 UI ============
    if (isUtility) {
        const mainSlot = preset.slots[0]
        return (
            <div className="min-h-full bg-wechat-bg pb-8">
                <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                        <ChevronLeft size={22} />
                    </button>
                    <h1 className="text-[17px] font-semibold flex-1 text-center truncate px-2">
                        {preset.name}
                        {preset.builtin && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-wechat-green/10 text-wechat-green rounded font-normal">内置</span>
                        )}
                    </h1>
                    <button
                        onClick={async () => {
                            try {
                                const { exportPreset } = await import('../services/backupService')
                                const path = await exportPreset(preset.id)
                                if (path) alert('已导出到：\n' + path)
                            } catch (e: any) {
                                alert('导出失败：' + (e?.message || e))
                            }
                        }}
                        className="p-2"
                        title="导出"
                    >
                        <Share2 size={18} />
                    </button>
                    <button onClick={handleDuplicate} className="p-2" title="复制">
                        <Copy size={18} />
                    </button>
                </header>

                <div className="bg-white px-4 py-3 border-b border-wechat-divider flex items-center justify-between">
                    <div className="text-[13px] text-wechat-textGray">
                        内部任务预设（单段 system prompt）
                    </div>
                    {!preset.builtin && (
                        <button
                            onClick={handleRename}
                            className="text-[13px] text-wechat-green px-3 py-1"
                        >
                            改名
                        </button>
                    )}
                </div>

                <div className="mt-2 bg-white p-3">
                    <SafeTextarea
                        rows={20}
                        className="w-full p-3 text-[13px] border border-wechat-divider rounded bg-white outline-none resize-y font-mono"
                        value={mainSlot?.content || ''}
                        onChange={(v) => mainSlot && updateSlot(preset.id, mainSlot.id, { content: v })}
                        placeholder="System prompt 内容..."
                    />
                </div>

                {!preset.builtin && (
                    <div className="mt-6 px-4">
                        <button
                            onClick={handleDelete}
                            className="w-full py-2.5 bg-white text-red-500 rounded-lg text-[14px] font-medium flex items-center justify-center gap-2"
                        >
                            <Trash2 size={16} />
                            删除预设
                        </button>
                    </div>
                )}
            </div>
        )
    }

    // ============ 对话预设：原 slot 编辑 UI ============
    return (
        <div className="min-h-full bg-wechat-bg pb-8">
            <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                    <ChevronLeft size={22} />
                </button>
                <h1 className="text-[17px] font-semibold flex-1 text-center truncate px-2">
                    {preset.name}
                    {preset.builtin && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-wechat-green/10 text-wechat-green rounded font-normal">内置</span>
                    )}
                </h1>
                <button
                    onClick={async () => {
                        try {
                            const { exportPreset } = await import('../services/backupService')
                            const path = await exportPreset(preset.id)
                            if (path) alert('已导出到：\n' + path)
                        } catch (e: any) {
                            alert('导出失败：' + (e?.message || e))
                        }
                    }}
                    className="p-2"
                    title="导出"
                >
                    <Share2 size={18} />
                </button>
                <button onClick={handleDuplicate} className="p-2" title="复制">
                    <Copy size={18} />
                </button>
            </header>

            <div className="bg-white px-4 py-3 border-b border-wechat-divider flex items-center justify-between">
                <div>
                    <div className="text-[13px] text-wechat-textGray">
                        {preset.mode === 'im' ? '微信模式' : '场景模式'} · {preset.slots.length} 个槽位
                    </div>
                    <div className="text-[11px] text-wechat-textGray mt-1">拖拽 ☰ 调整顺序</div>
                </div>
                {!preset.builtin && (
                    <button
                        onClick={handleRename}
                        className="text-[13px] text-wechat-green px-3 py-1"
                    >
                        改名
                    </button>
                )}
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={preset.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="mt-2">
                        {preset.slots.map((slot) => (
                            <SortableSlot
                                key={slot.id}
                                slot={slot}
                                expanded={expandedId === slot.id}
                                onToggle={() => setExpandedId(expandedId === slot.id ? null : slot.id)}
                                onChange={(patch) => updateSlot(preset.id, slot.id, patch)}
                                onDelete={() => {
                                    if (confirm(`删除槽位"${slot.name}"？`)) removeSlot(preset.id, slot.id)
                                }}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <div className="mt-2 bg-white">
                <button
                    onClick={handleAddSlot}
                    className="w-full flex items-center gap-2 px-4 py-3 text-wechat-green text-[14px] hover:bg-wechat-bg"
                >
                    <Plus size={16} />
                    添加槽位
                </button>
            </div>

            {!preset.builtin && (
                <div className="mt-6 px-4">
                    <button
                        onClick={handleDelete}
                        className="w-full py-2.5 bg-white text-red-500 rounded-lg text-[14px] font-medium flex items-center justify-center gap-2"
                    >
                        <Trash2 size={16} />
                        删除预设
                    </button>
                </div>
            )}
        </div>
    )
}

function SortableSlot({
    slot, expanded, onToggle, onChange, onDelete,
}: {
    slot: PromptSlot
    expanded: boolean
    onToggle: () => void
    onChange: (patch: Partial<PromptSlot>) => void
    onDelete: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id })
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const hasContentField = slot.role === 'static' || slot.role === 'jailbreak'
        || slot.role === 'char_description' || slot.role === 'char_personality'
        || slot.role === 'char_scenario' || slot.role === 'char_mes_example'
        || slot.role === 'user_persona' || slot.role === 'char_system_prompt'
        || slot.role === 'char_post_history'
        || slot.role === 'user_moments' || slot.role === 'character_moments'
        || slot.role === 'moment_interactions'
        || slot.role === 'scene_summary'


    return (
        <div ref={setNodeRef} style={style} className="bg-white mb-1 border-b border-wechat-divider">
            <div className="flex items-center gap-2 px-2 py-2.5">
                <button {...attributes} {...listeners} className="p-1 cursor-grab active:cursor-grabbing touch-none">
                    <GripVertical size={16} className="text-wechat-textGray" />
                </button>
                <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(e) => onChange({ enabled: e.target.checked })}
                    className="w-4 h-4 accent-wechat-green shrink-0"
                />
                <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
                    <div className="flex-1 min-w-0">
                        <div className={`text-[14px] truncate ${slot.enabled ? '' : 'text-wechat-textGray'}`}>
                            {slot.name}
                        </div>
                        <div className="text-[11px] text-wechat-textGray truncate">
                            {ROLE_LABELS[slot.role]} · {slot.messageRole}
                        </div>
                    </div>
                </button>
                <button onClick={onDelete} className="p-1.5 text-red-500">
                    <Trash2 size={14} />
                </button>
            </div>

            {expanded && (
                <div className="px-4 pb-3 space-y-2.5 border-t border-wechat-divider/50 pt-3 bg-wechat-bg/30">
                    <Field label="槽位名">
                        <SafeInput
                            className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                            value={slot.name}
                            onChange={(v) => onChange({ name: v })}
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                        <Field label="类型">
                            <select
                                className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                value={slot.role}
                                onChange={(e) => onChange({ role: e.target.value as SlotRole })}
                            >
                                {ROLE_OPTIONS.map((r) => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="消息角色">
                            <select
                                className="w-full text-[13px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none"
                                value={slot.messageRole}
                                onChange={(e) => onChange({ messageRole: e.target.value as 'system' | 'user' | 'assistant' })}
                            >
                                <option value="system">system</option>
                                <option value="user">user</option>
                                <option value="assistant">assistant</option>
                            </select>
                        </Field>
                    </div>

                    {hasContentField && (
                        <Field
                            label="内容"
                            hint={
                                slot.role === 'static' || slot.role === 'jailbreak'
                                    ? '支持宏：{{char}} {{user}} {{datetime}} 等'
                                    : '可作为标题前缀；运行时会拼接对应字段内容'
                            }
                        >
                            <SafeTextarea
                                rows={slot.role === 'static' || slot.role === 'jailbreak' ? 10 : 3}
                                className="w-full text-[12px] px-2 py-1.5 border border-wechat-divider rounded bg-white outline-none resize-none font-mono"
                                value={slot.content}
                                onChange={(v) => onChange({ content: v })}
                            />
                        </Field>
                    )}

                    {!hasContentField && (
                        <div className="text-[11px] text-wechat-textGray">
                            此类型为动态填充（如历史消息/世界书），无需配置内容。
                        </div>
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
