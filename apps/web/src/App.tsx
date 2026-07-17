import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AIChat from './pages/AIChat';
import Portfolio from './pages/Portfolio';
import Watchlist from './pages/Watchlist';
import Backtesting from './pages/Backtesting';
import NewsIntelligence from './pages/NewsIntelligence';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/ai-chat', label: 'AI Chat' },
  { to: '/backtesting', label: 'Backtesting' },
  { to: '/news', label: 'News Intelligence' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <h1>Artha AI</h1>
          <nav>
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/ai-chat" element={<AIChat />} />
            <Route path="/backtesting" element={<Backtesting />} />
            <Route path="/news" element={<NewsIntelligence />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
