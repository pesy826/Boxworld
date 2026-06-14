import { Outlet, NavLink } from 'react-router-dom'
import { MessageCircle, Users, Compass, User } from 'lucide-react'

const tabs = [
  { to: '/chats',    label: '微信',     icon: MessageCircle, tour: 'tab-chats' },
  { to: '/contacts', label: '通讯录',   icon: Users,         tour: 'tab-contacts' },
  { to: '/discover', label: '发现',     icon: Compass,       tour: 'tab-discover' },
  { to: '/me',       label: '我',       icon: User,          tour: 'tab-me' },
]

export default function MainLayout() {
  return (
    <div className="w-full max-w-[480px] h-screen bg-wechat-bg flex flex-col shadow-xl">
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        <Outlet />
      </main>

      {/* 底部 Tab 栏：自动避开手机底部小白条 / 圆角 */}
      <nav className="h-tab-safe bg-wechat-nav border-t border-wechat-divider flex shrink-0">
        {tabs.map(({ to, label, icon: Icon, tour }) => (
          <NavLink
            key={to}
            to={to}
            data-tour={tour}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                isActive ? 'text-wechat-green' : 'text-wechat-textGray'
              }`
            }
          >
            <Icon size={22} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
