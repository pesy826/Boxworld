import { useState, useEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
}

export function SafeTextarea({ value, onChange, ...rest }: Props) {
  const [inner, setInner] = useState(value)
  const composingRef = useRef(false)

  useEffect(() => {
    if (!composingRef.current) setInner(value)
  }, [value])

  return (
    <textarea
      {...rest}
      value={inner}
      onChange={(e) => {
        const v = e.target.value
        setInner(v)
        if (!composingRef.current) onChange(v)
      }}
      onCompositionStart={() => { composingRef.current = true }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        onChange((e.target as HTMLTextAreaElement).value)
      }}
    />
  )
}
