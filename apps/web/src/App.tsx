import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AIChat from './pages/AIChat';
import Portfolio from './pages/Portfolio';
import Watchlist from './pages/Watchlist';
import Backtesting from './pages/Backtesting';
import NewsIntelligence from './pages/NewsIntelligence';
import CopilotTrading from './pages/CopilotTrading';
import SandboxPage from './pages/Sandbox';
import FnODashboard from './pages/FnODashboard';

const NAV = [
  { to: '/', label: '📊 Dashboard', end: true },
  { to: '/fno', label: '🎯 F&O Analytics' },
  { to: '/watchlist', label: '📈 Watchlist' },
  { to: '/portfolio', label: '💼 Portfolio' },
  { to: '/copilot-trading', label: '🤖 Copilot Trading' },
  { to: '/ai-chat', label: '💬 AI Chat' },
  { to: '/backtesting', label: '⚙️ Backtesting' },
  { to: '/news', label: '📰 News Intelligence' },
  { to: '/sandbox', label: '🧪 Dual Sandbox' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <h1>⚡ Artha AI</h1>
          <nav>
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div style={{ marginTop: 'auto', padding: '20px 10px 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            <div>Artha AI Copilot v2.0</div>
            <div>Paper Trading Mode</div>
            <div style={{ marginTop: 4, color: 'rgba(16,185,129,0.7)' }}>● All systems nominal</div>
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fno" element={<FnODashboard />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/copilot-trading" element={<CopilotTrading />} />
            <Route path="/ai-chat" element={<AIChat />} />
            <Route path="/backtesting" element={<Backtesting />} />
            <Route path="/news" element={<NewsIntelligence />} />
            <Route path="/sandbox" element={<SandboxPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
