import { db } from '../db'
import type { VirtualTimeState } from '../types'
import { useCharacterStore } from '../stores/characterStore'

type Listener = (now: number) => void

class TimeService {
  private state: VirtualTimeState | null = null
  private listeners = new Set<Listener>()
  private tickTimer: number | null = null

  async init() {
    const settings = await db.settings.get('singleton')
    if (!settings) throw new Error('settings 未初始化')
    this.state = settings.virtualTime
    this.startTicking()
  }

  /** 全局当前虚拟时间戳（毫秒） */
  now(): number {
    if (!this.state) return Date.now()
    if (this.state.paused) return this.state.virtualNow
    const realElapsed = Date.now() - this.state.realAnchor
    return this.state.virtualNow + realElapsed * this.state.timeScale
  }

  getState(): VirtualTimeState {
    if (!this.state) throw new Error('TimeService 未初始化')
    return { ...this.state }
  }

  async jumpTo(target: number) {
    if (!this.state) return
    this.state = { ...this.state, virtualNow: target, realAnchor: Date.now() }
    await this.persist()
    this.emit()
  }

  async advance(deltaMs: number) {
    await this.jumpTo(this.now() + deltaMs)
  }

  async pause() {
    if (!this.state || this.state.paused) return
    this.state = { ...this.state, virtualNow: this.now(), realAnchor: Date.now(), paused: true }
    await this.persist()
    this.emit()
  }

  async resume() {
    if (!this.state || !this.state.paused) return
    this.state = { ...this.state, realAnchor: Date.now(), paused: false }
    await this.persist()
    this.emit()
  }

  async setScale(scale: number) {
    if (!this.state) return
    this.state = { ...this.state, virtualNow: this.now(), realAnchor: Date.now(), timeScale: scale }
    await this.persist()
    this.emit()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ============ 单卡模式：每卡独立时间线 ============

  /**
   * 某张卡的"当前有效时间"。
   * - 没启用独立时间线：返回全局时间
   * - 已启用：返回独立时间线的当前时刻（随现实流动，用全局 timeScale）
   *
   * 注意：这里不直接读 characterStore（避免循环依赖），改为接收 character 对象。
   */
  nowForCharacter(char: { id?: string; isNpc?: boolean; parentWorldId?: string; soloModeEntered?: boolean; soloVirtualTime?: number; soloRealAnchor?: number } | null | undefined): number {
    if (!char) return this.now()

    // NPC：跟随所属世界主卡的时间
    if (char.isNpc && char.parentWorldId) {
      const mainChar = useCharacterStore.getState().getById(char.parentWorldId)
      if (mainChar) return this.nowForCharacter(mainChar)
      return this.now()
    }

    if (!char.soloModeEntered) return this.now()
    if (!this.state) return char.soloVirtualTime || this.now()
    if (this.state.paused) return char.soloVirtualTime || 0
    const realElapsed = Date.now() - (char.soloRealAnchor || Date.now())
    return (char.soloVirtualTime || 0) + realElapsed * this.state.timeScale
  }

  isLocked(char: { id?: string; isNpc?: boolean; parentWorldId?: string; soloModeEntered?: boolean; soloVirtualTime?: number; soloRealAnchor?: number } | null | undefined): boolean {
    if (!char) return false
    // NPC 的锁定状态跟随主卡
    if (char.isNpc && char.parentWorldId) {
      const mainChar = useCharacterStore.getState().getById(char.parentWorldId)
      return mainChar ? this.isLocked(mainChar) : false
    }
    if (!char.soloModeEntered) return false
    return this.nowForCharacter(char) > this.now() + 1000
  }


  // ---------- 内部方法 ----------

  private emit() {
    const now = this.now()
    this.listeners.forEach((l) => l(now))
  }

  private startTicking() {
    if (this.tickTimer !== null) return
    this.tickTimer = window.setInterval(() => {
      this.emit()
    }, 1000)
  }

  private async persist() {
    if (!this.state) return
    const settings = await db.settings.get('singleton')
    if (!settings) return
    await db.settings.put({ ...settings, virtualTime: this.state })
  }
}

export const timeService = new TimeService()
