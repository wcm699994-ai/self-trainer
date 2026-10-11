import { useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ConfigPage from './pages/ConfigPage';
import ReviewPage from './pages/ReviewPage';
import GuidePage from './pages/GuidePage';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore } from './store/useStore';

function App() {
  const loadRecords = useStore((s) => s.loadRecords);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const navClass = ({ isActive }) =>
    `px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[13px] sm:text-sm font-medium transition-colors ${
      isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 pt-[env(safe-area-inset-top)]">
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">SelfTrainer</h1>
              <nav className="flex gap-1 sm:gap-1.5">
                <NavLink to="/" end className={navClass}>今日训练</NavLink>
                <NavLink to="/config" className={navClass}>配置</NavLink>
                <NavLink to="/review" className={navClass}>复盘</NavLink>
                <NavLink to="/guide" className={navClass}>使用说明</NavLink>
              </nav>
            </div>
          </header>

          <main className="flex-1 max-w-3xl w-full mx-auto px-3 py-4 sm:px-4 sm:py-6">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/guide" element={<GuidePage />} />
            </Routes>
          </main>

          <footer className="border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 text-xs text-gray-400">
              SelfTrainer · 本地优先 · 开源 MIT 协议
            </div>
          </footer>
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
