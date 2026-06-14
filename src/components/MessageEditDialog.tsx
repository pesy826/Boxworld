import { useState, useEffect } from 'react'
import { SafeTextarea } from './SafeTextarea'

interface Props {
  initialText: string
  onConfirm: (text: string) => void
  onCancel: () => void
}

export default function MessageEditDialog({ initialText, onConfirm, onCancel }: Props) {
  const [text, setText] = useState(initialText)

  // 按 ESC 取消
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-[360px] bg-white rounded-lg overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-wechat-divider text-[15px] font-medium">
          编辑消息
        </div>
        <div className="p-3">
          <SafeTextarea
            rows={6}
            value={text}
            onChange={setText}
            className="w-full p-2 text-[14px] border border-wechat-divider rounded outline-none resize-none focus:border-wechat-green"
            autoFocus
          />
        </div>
        <div className="px-3 py-2 border-t border-wechat-divider flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[14px] text-wechat-textGray"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(text)}
            disabled={!text.trim()}
            className="px-4 py-1.5 text-[14px] bg-wechat-green text-white rounded disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
