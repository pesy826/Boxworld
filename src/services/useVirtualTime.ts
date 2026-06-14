import { useEffect, useState } from 'react'
import { timeService } from './timeService'
import { useCharacterStore } from '../stores/characterStore'

/**
 * 订阅全局虚拟时间，每秒自动重渲染。
 */
export function useVirtualTime(): number {
  const [now, setNow] = useState(() => timeService.now())
  useEffect(() => {
    setNow(timeService.now())
    const unsub = timeService.subscribe(setNow)
    return unsub
  }, [])
  return now
}

/**
 * 订阅某张卡的有效时间（独立时间线或全局），每秒重渲染。
 */
export function useCharacterTime(characterId: string | undefined): number {
  const char = useCharacterStore((s) => characterId ? s.getById(characterId) : undefined)
  const [now, setNow] = useState(() => timeService.nowForCharacter(char))
  useEffect(() => {
    const update = () => setNow(timeService.nowForCharacter(char))
    update()
    const unsub = timeService.subscribe(update)
    return unsub
  }, [char])
  return now
}
