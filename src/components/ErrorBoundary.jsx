import { Component } from 'react';

// 全局错误兜底：避免任何渲染异常导致整页白屏
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('SelfTrainer 渲染异常:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="card w-full max-w-md p-6 text-center space-y-3">
            <div className="text-3xl">⚠️</div>
            <h1 className="text-lg font-semibold">页面出现异常</h1>
            <p className="text-sm text-gray-500 break-all">
              {String(this.state.error?.message || this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              刷新页面
            </button>
            <p className="text-xs text-gray-400">
              本地数据保存在浏览器中，刷新不会丢失已录入的记录。
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
