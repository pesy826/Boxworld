/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 微信风格配色
        wechat: {
          bg: '#EDEDED',           // 主背景灰
          nav: '#F7F7F7',          // 顶部/底部导航
          green: '#07C160',        // 微信绿（按钮、未读点）
          greenDark: '#06AD56',
          bubble: '#A9EA7A',       // 自己发的气泡绿
          divider: '#E5E5E5',      // 分割线
          text: '#181818',
          textGray: '#888888',
          link: '#576B95',         // 朋友圈链接蓝
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
