import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 全局错误边界：React 18 渲染报错时如果没有错误边界会卸载整棵树（白屏）。
 * 有了这个组件，白屏会变成可见的错误信息，方便定位问题。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[boxworld] 页面渲染出错：', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#c00', marginBottom: 8 }}>
            页面渲染出错
          </div>
          <div style={{ fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 12 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack?.slice(0, 800)}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); location.href = '/' }}
            style={{ padding: '8px 20px', background: '#07c160', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14 }}
          >
            回到首页
          </button>
        </div>
      )
    }
    return this.props.children
  }
}