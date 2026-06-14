import { Outlet } from 'react-router-dom'

export default function SubPageLayout() {
  // 不用 flex（flex item 内 sticky 行为异常会让页面 header 滚动后消失），
  // 直接用 block + overflow-y-auto 作为滚动容器，各页面 sticky 顶栏才稳定可见；
  // 用 boxworld-scroll 显示细滚动条（电脑端可拖动），不再隐藏。
  return (
    <div className="w-full max-w-[480px] h-screen bg-wechat-bg shadow-xl overflow-y-auto boxworld-scroll">
      <Outlet />
    </div>
  )
}
