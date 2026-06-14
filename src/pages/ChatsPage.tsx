import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useVirtualTime } from '../services/useVirtualTime'
import { formatRelative } from '../utils/time'
import Avatar from '../components/Avatar'
import { usePageTour } from '../components/TourOverlay'
import { chatsTour } from '../components/tours'
import type { Chat } from '../types'

export default function ChatsPage() {
  const navigate = useNavigate()
  const chats = useChatStore((s) => s.chats)
  const getCharacter = useCharacterStore((s) => s.getById)
  const now = useVirtualTime()
  usePageTour(chatsTour)

  return (
    <div className="min-h-full bg-white">
      <header className="h-header-safe flex items-center px-4 border-b border-wechat-divider">
        <h1 className="text-[17px] font-semibold flex-1">微信</h1>
        <button
          onClick={() => navigate('/group-create')}
          data-tour="group-create"
          className="p-2 -mr-2 text-wechat-textDark"
          title="发起群聊"
        >
          <Users size={20} />
        </button>
      </header>

      {chats.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
          还没有聊天<br />
          <button
            className="mt-3 px-4 py-2 text-wechat-green text-[14px]"
            onClick={() => navigate('/contacts')}
          >
            去通讯录开聊
          </button>
        </div>
      ) : (
        <div>
          {chats.map((chat) => {
            const isGroup = chat.type === 'group'
            const char = isGroup ? undefined : getCharacter(chat.characterId)
            if (!isGroup && !char) return null
            const title = isGroup ? (chat.name || '群聊') : char!.name
            return (
              <button
                key={chat.id}
                onClick={() => navigate(`/chat/${chat.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg text-left"
              >
                <div className="relative shrink-0">
                  {isGroup ? (
                    <GroupAvatar chat={chat} size={48} />
                  ) : (
                    <Avatar src={char!.avatar} name={char!.name} size={48} />
                  )}
                  {chat.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[11px] rounded-full flex items-center justify-center px-1">
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[15px] truncate">
                      {title}
                      {isGroup && (
                        <span className="ml-1 text-[11px] text-wechat-textGray">
                          ({chat.memberIds?.length || 0})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-wechat-textGray shrink-0">
                      {chat.lastMessageAt > 0 && formatRelative(chat.lastMessageAt, now)}
                    </div>
                  </div>
                  <div className="text-[13px] text-wechat-textGray truncate mt-0.5">
                    {chat.lastMessagePreview || '（暂无消息）'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 群头像：用户 + 前 3 个成员头像拼四宫格 */
function GroupAvatar({ chat, size }: { chat: Chat; size: number }) {
  const getCharacter = useCharacterStore((s) => s.getById)
  const userName = useSettingsStore((s) => s.settings?.userPersona.name) || '我'
  const userAvatar = useSettingsStore((s) => s.settings?.userPersona.avatar)

  const cells: Array<{ avatar?: string; name: string }> = [
    { avatar: userAvatar, name: userName },
    ...(chat.memberIds || []).slice(0, 3)
      .map((id) => getCharacter(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ avatar: m.avatar, name: m.name })),
  ].slice(0, 4)

  return (
    <div
      className="rounded-md bg-wechat-bg overflow-hidden grid grid-cols-2 gap-[1px] p-[2px]"
      style={{ width: size, height: size }}
    >
      {cells.map((c, i) => (
        <div key={i} className="overflow-hidden rounded-[2px]">
          <Avatar src={c.avatar} name={c.name} size={size / 2 - 3} />
        </div>
      ))}
    </div>
  )
}
