import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initDatabase } from './db/init'
import { timeService } from './services/timeService'
import { useSettingsStore } from './stores/settingsStore'
import { useCharacterStore } from './stores/characterStore'
import { useLorebookStore } from './stores/lorebookStore'
import { usePresetStore } from './stores/presetStore'
import { useChatStore } from './stores/chatStore'
import { useTickLogStore } from './stores/tickLogStore'
import { useMomentStore } from './stores/momentStore'
import { useSceneSummaryStore } from './stores/sceneSummaryStore'
import { useWorldSummaryStore } from './stores/worldSummaryStore'
import { useStickerStore, useAvatarLibStore } from './stores/assetStore'

const rootEl = document.getElementById('root')!
rootEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:sans-serif;font-size:14px;">盒世界启动中...</div>'

async function bootstrap() {
  await initDatabase()
  await timeService.init()
  await useSettingsStore.getState().load()
  await useCharacterStore.getState().load()
  await useLorebookStore.getState().load()
  await usePresetStore.getState().load()
  await useChatStore.getState().load()
  await useTickLogStore.getState().load()
  await useMomentStore.getState().load()
  await useSceneSummaryStore.getState().load()
  await useWorldSummaryStore.getState().load()
  await useStickerStore.getState().load()
  await useAvatarLibStore.getState().load()
  const { repairSoloState } = await import('./services/soloModeService')
  await repairSoloState()
  console.log('[boxworld] 启动完成')

  // 内置素材包导入（后台进行，不阻塞启动）
  import('./services/builtinAssets').then(({ importBuiltinAssetsIfNeeded }) => {
    importBuiltinAssetsIfNeeded().catch((e) => console.warn('[boxworld] 内置素材导入失败:', e))
  })

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )

  setTimeout(() => {
    import('./services/tickService').then(({ startupTick }) => {
      startupTick().catch((e) => console.warn('[boxworld] 启动补算失败:', e))
    })
  }, 1000)
}

bootstrap().catch((e) => {
  console.error('[boxworld] 启动失败：', e)
  rootEl.innerHTML = `<div style="padding:20px;color:#c00;font-family:sans-serif;font-size:14px;white-space:pre-wrap;">盒世界启动失败：\n${e?.message || e}</div>`
})
