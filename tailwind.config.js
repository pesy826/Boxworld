/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 微信风格配色（用 CSS 变量，自动跟随亮/暗主题，变量定义在 index.css）
        wechat: {
          bg: 'var(--wc-bg)',           // 主背景灰
          nav: 'var(--wc-nav)',         // 顶部/底部导航
          green: '#07C160',             // 微信绿（按钮、未读点，亮暗一致）
          greenDark: '#06AD56',
          bubble: 'var(--wc-bubble)',   // 自己发的气泡绿
          divider: 'var(--wc-divider)', // 分割线
          text: 'var(--wc-text)',
          textGray: 'var(--wc-text-gray)',
          link: '#576B95',              // 朋友圈链接蓝
          // 卡片/面板底色（替代硬编码 bg-white；用 bg-wechat-card）
          card: 'var(--wc-card)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
