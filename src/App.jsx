import { useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ConfigPage from './pages/ConfigPage';
import ReviewPage from './pages/ReviewPage';
import GuidePage from './pages/GuidePage';
import { useStore } from './store/useStore';

function App() {
  const loadRecords = useStore((s) => s.loadRecords);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const navClass = ({ isActive }) =>
    `px-3 py-1.5 rounded text-sm ${
      isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">SelfTrainer</h1>
            <nav className="flex gap-2">
              <NavLink to="/" className={navClass}>今日训练</NavLink>
              <NavLink to="/config" className={navClass}>配置</NavLink>
              <NavLink to="/review" className={navClass}>复盘</NavLink>
              <NavLink to="/guide" className={navClass}>使用说明</NavLink>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/guide" element={<GuidePage />} />
          </Routes>
        </main>

        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-4 text-xs text-gray-400">
            SelfTrainer · 本地优先 · 开源 MIT 协议
          </div>
        </footer>
      </div>
    </HashRouter>
  );
}

export default App;
