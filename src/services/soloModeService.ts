import { timeService } from './timeService'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * 进入某张卡的单卡模式。
 * 首次进入时，用当前全局时间初始化它的独立时间线（选项 A）。
 */
export async function enterSoloMode(characterId: string) {
    const char = useCharacterStore.getState().getById(characterId)
    if (!char) return

    if (!char.soloModeEntered) {
        await useCharacterStore.getState().update(characterId, {
            soloModeEntered: true,
            soloVirtualTime: timeService.now(),
            soloRealAnchor: Date.now(),
        })
    }
    await useSettingsStore.getState().setActiveSoloCharacter(characterId)
}

/** 退出单卡模式，回到全局 */
export async function exitSoloMode() {
    await useSettingsStore.getState().setActiveSoloCharacter(undefined)
}

/** 推进某卡独立时间（毫秒）。仅对已启用独立时间线的卡有效。 */
export async function advanceCharacterTime(characterId: string, deltaMs: number) {
    const char = useCharacterStore.getState().getById(characterId)
    if (!char || !char.soloModeEntered) return
    const current = timeService.nowForCharacter(char)
    await useCharacterStore.getState().update(characterId, {
        soloVirtualTime: current + deltaMs,
        soloRealAnchor: Date.now(),
    })
}

/** 直接设置某卡独立时间 */
export async function setCharacterTime(characterId: string, virtualTime: number) {
    const char = useCharacterStore.getState().getById(characterId)
    if (!char || !char.soloModeEntered) return
    await useCharacterStore.getState().update(characterId, {
        soloVirtualTime: virtualTime,
        soloRealAnchor: Date.now(),
    })
}

/** 当前是否在某卡的单卡模式 */
export function getActiveSoloCharacterId(): string | undefined {
    return useSettingsStore.getState().settings?.activeSoloCharacterId
}

/**
 * 全局视角下角色是否被锁定。
 * 当前激活的单卡世界（主卡及其 NPC）不算锁定——你正在那个世界里玩。
 */
export function isCharacterLockedForGlobal(characterId: string): boolean {
    const char = useCharacterStore.getState().getById(characterId)
    if (!char) return false
    const activeSolo = useSettingsStore.getState().settings?.activeSoloCharacterId
    const worldId = char.isNpc ? char.parentWorldId : char.id
    if (activeSolo && worldId === activeSolo) return false  // 激活世界豁免
    return timeService.isLocked(char)
}

/**
 * 启动自检：如果 settings 记录了激活的单卡，但该角色的独立时间线未启用
 * （数据重置/迁移导致的不一致），自动补初始化。
 */
export async function repairSoloState() {
    const activeId = useSettingsStore.getState().settings?.activeSoloCharacterId
    if (!activeId) return
    const char = useCharacterStore.getState().getById(activeId)
    if (!char) {
        // 激活的卡已不存在，清掉
        await useSettingsStore.getState().setActiveSoloCharacter(undefined)
        console.log('[solo] 修复：激活的单卡已不存在，已退出单卡模式')
        return
    }
    if (!char.soloModeEntered) {
        await useCharacterStore.getState().update(activeId, {
            soloModeEntered: true,
            soloVirtualTime: timeService.now(),
            soloRealAnchor: Date.now(),
        })
        console.log('[solo] 修复：为当前激活单卡补初始化独立时间线')
    }
}
