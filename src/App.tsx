import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import SubPageLayout from './layouts/SubPageLayout'
import ChatsPage from './pages/ChatsPage'
import ContactsPage from './pages/ContactsPage'
import DiscoverPage from './pages/DiscoverPage'
import MePage from './pages/MePage'
import SettingsPage from './pages/SettingsPage'
import CharacterDetailPage from './pages/CharacterDetailPage'
import CharacterEditPage from './pages/CharacterEditPage'
import LorebooksPage from './pages/LorebooksPage'
import LorebookDetailPage from './pages/LorebookDetailPage'
import PresetsPage from './pages/PresetsPage'
import PresetEditPage from './pages/PresetEditPage'
import ChatPage from './pages/ChatPage'
import TickLogPage from './pages/TickLogPage'
import MomentsPage from './pages/MomentsPage'
import SceneModePage from './pages/SceneModePage'
import DebugPromptsPage from './pages/DebugPromptsPage'
import NpcGeneratePage from './pages/NpcGeneratePage'
import GroupCreatePage from './pages/GroupCreatePage'
import AssetLibraryPage from './pages/AssetLibraryPage'
import VoiceCallPage from './pages/VoiceCallPage'
import TourOverlay, { WelcomeDialog } from './components/TourOverlay'


function App() {
  return (
    <>
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/chats" replace />} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="me" element={<MePage />} />
      </Route>

      <Route element={<SubPageLayout />}>
        <Route path="settings" element={<SettingsPage />} />
        <Route path="character-create" element={<CharacterEditPage />} />
        <Route path="character/:id" element={<CharacterDetailPage />} />
        <Route path="character/:id/edit" element={<CharacterEditPage />} />
        <Route path="npc-generate/:id" element={<NpcGeneratePage />} />
        <Route path="lorebooks" element={<LorebooksPage />} />
        <Route path="lorebook/:id" element={<LorebookDetailPage />} />
        <Route path="presets" element={<PresetsPage />} />
        <Route path="preset/:id" element={<PresetEditPage />} />
        <Route path="chat/:id" element={<ChatPage />} />
        <Route path="group-create" element={<GroupCreatePage />} />
        <Route path="tick-log" element={<TickLogPage />} />
        <Route path="moments" element={<MomentsPage />} />
        <Route path="scene/:id" element={<SceneModePage />} />
        <Route path="debug-prompts" element={<DebugPromptsPage />} />
        <Route path="assets" element={<AssetLibraryPage />} />
      </Route>

      {/* 全屏语音通话页（自带覆盖层，不套导航壳） */}
      <Route path="voice-call/:id" element={<VoiceCallPage />} />
    </Routes>
    <TourOverlay />
    <WelcomeDialog />
    </>
  )
}

export default App
