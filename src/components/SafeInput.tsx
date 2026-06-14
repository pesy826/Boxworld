import { useState, useEffect, useRef } from 'react'
import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
}

/**
 * 兼容中文输入法的输入框：
 * - 组合输入中（拼音未确认）不触发 onChange
 * - 组合结束后才提交最终值
 */
export function SafeInput({ value, onChange, ...rest }: Props) {
  const [inner, setInner] = useState(value)
  const composingRef = useRef(false)

  // 外部 value 变了，同步 inner（但组合中不要打扰）
  useEffect(() => {
    if (!composingRef.current) setInner(value)
  }, [value])

  return (
    <input
      {...rest}
      value={inner}
      onChange={(e) => {
        const v = e.target.value
        setInner(v)
        if (!composingRef.current) onChange(v)
      }}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        onChange((e.target as HTMLInputElement).value)
      }}
    />
  )
}
