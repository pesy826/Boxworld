import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Sparkles, Loader2, ChevronDown } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { generateNpcs } from '../services/npcService'
import { SafeTextarea } from '../components/SafeTextarea'

const QUICK_PROMPTS = [
    '根据世界观和人物关系，生成合适的 NPC',
    '生成一个主角的同事',
    '生成一个主角的家人',
    '生成一个用户的朋友',
    '生成一个和主角有矛盾的人物',
    '生成一个推动剧情的关键配角',
]

export default function NpcGeneratePage() {
    const { id = '' } = useParams()
    const navigate = useNavigate()
    const characters = useCharacterStore((s) => s.characters)
    const mainChar = characters.find((c) => c.id === id)
    const existingNpcs = characters.filter((c) => c.isNpc && c.parentWorldId === id)


    const [request, setRequest] = useState('')
    const [generating, setGenerating] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const [showQuick, setShowQuick] = useState(false)

    if (!mainChar) {
        return (
            <div className="min-h-full bg-wechat-bg flex flex-col">
                <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2"><ChevronLeft size={22} /></button>
                </header>
                <div className="flex-1 flex items-center justify-center text-wechat-textGray">角色不存在</div>
            </div>
        )
    }

    const handleGenerate = async () => {
        if (generating) return
        setGenerating(true)
        setResult(null)
        const r = await generateNpcs(id, request.trim())
        setGenerating(false)
        if (r.ok && r.npcs) {
            setResult(`✓ 生成了 ${r.npcs.length} 个 NPC：\n${r.npcs.map((n) => `· ${n.name}（${n.relation}）`).join('\n')}`)
            setRequest('')
        } else {
            setResult(`✗ ${r.error || '生成失败'}`)
        }
    }

    return (
        <div className="min-h-full bg-wechat-bg pb-8">
            <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2"><ChevronLeft size={22} /></button>
                <h1 className="text-[17px] font-semibold flex-1 text-center">生成 NPC</h1>
            </header>

            <div className="bg-white px-4 py-3 border-b border-wechat-divider">
                <div className="text-[13px] text-wechat-textGray">
                    为「{mainChar.name}」的世界生成 NPC 配角
                </div>
                <div className="text-[12px] text-wechat-textGray mt-1">
                    已有 {existingNpcs.length} 个 NPC
                </div>
            </div>

            <div className="mt-3 px-4">
                <div className="text-[13px] mb-2">生成需求</div>
                <div className="relative">
                    <SafeTextarea
                        rows={3}
                        placeholder="例如：生成一个主角的消防队同事，性格开朗（留空则自动根据世界观生成）"
                        className="w-full p-3 text-[14px] border border-wechat-divider rounded bg-white outline-none resize-none pr-10"
                        value={request}
                        onChange={setRequest}
                    />
                    {/* 懒人下拉框 */}
                    <button
                        onClick={() => setShowQuick(!showQuick)}
                        className="absolute top-2 right-2 p-1.5 text-wechat-textGray hover:text-wechat-green"
                        title="快捷需求"
                    >
                        <ChevronDown size={18} />
                    </button>
                    {showQuick && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowQuick(false)} />
                            <div className="absolute right-2 top-10 z-20 bg-white shadow-lg rounded border border-wechat-divider w-[260px] py-1">
                                {QUICK_PROMPTS.map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => { setRequest(q); setShowQuick(false) }}
                                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-wechat-bg"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="mt-3 w-full py-2.5 bg-wechat-green text-white rounded text-[14px] font-medium disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {generating ? '生成中...' : '生成 NPC'}
                </button>

                {result && (
                    <div className={`mt-3 p-3 rounded text-[13px] whitespace-pre-wrap ${result.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                        }`}>
                        {result}
                        {result.startsWith('✓') && (
                            <button
                                onClick={() => navigate(-1)}
                                className="block mt-2 text-wechat-link"
                            >
                                返回通讯录查看 →
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* 已有 NPC 列表 */}
            {existingNpcs.length > 0 && (
                <div className="mt-4">
                    <div className="px-4 py-2 text-[12px] text-wechat-textGray">本世界已有 NPC</div>
                    <div className="bg-white">
                        {existingNpcs.map((n) => (
                            <div key={n.id} className="px-4 py-2.5 border-b border-wechat-divider">
                                <div className="text-[14px]">{n.name}</div>
                                <div className="text-[12px] text-wechat-textGray">{n.npcRelation}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
