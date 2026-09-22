import React from 'react';
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
import { TopNav } from './components/TopNav';
import {
  IconDashboard,
  IconZap,
  IconCandlestick,
  IconPortfolio,
  IconBot,
  IconFlask,
  IconSparkles,
  IconNews,
  IconBacktest,
  IconShieldCheck
} from './components/Icons';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        {/* Institutional Left Sidebar */}
        <aside className="sidebar">
          {/* Brand Header */}
          <div className="sidebar-brand">
            <div className="brand-icon-box">
              <IconZap size={20} color="#ffffff" />
            </div>
            <div className="brand-info">
              <h1>ARTHA AI</h1>
              <div className="brand-tagline">Institutional Copilot</div>
            </div>
          </div>

          {/* Nav Categories */}
          <div className="nav-category">
            <div className="nav-category-title">Execution & Markets</div>
            <nav>
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconDashboard size={16} className="nav-icon" />
                  <span>Market Terminal</span>
                </div>
              </NavLink>

              <NavLink to="/fno" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconZap size={16} className="nav-icon" />
                  <span>F&O Analytics</span>
                </div>
                <span className="nav-pill nav-pill-hot">LIVE</span>
              </NavLink>

              <NavLink to="/watchlist" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconCandlestick size={16} className="nav-icon" />
                  <span>Watchlist & Depth</span>
                </div>
              </NavLink>
            </nav>
          </div>

          <div className="nav-category">
            <div className="nav-category-title">Capital & Risk</div>
            <nav>
              <NavLink to="/portfolio" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconPortfolio size={16} className="nav-icon" />
                  <span>Portfolio Vault</span>
                </div>
              </NavLink>

              <NavLink to="/copilot-trading" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconBot size={16} className="nav-icon" />
                  <span>Copilot Execution</span>
                </div>
              </NavLink>

              <NavLink to="/sandbox" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconFlask size={16} className="nav-icon" />
                  <span>Dual Sandbox</span>
                </div>
              </NavLink>
            </nav>
          </div>

          <div className="nav-category">
            <div className="nav-category-title">AI & Quantitative</div>
            <nav>
              <NavLink to="/ai-chat" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconSparkles size={16} className="nav-icon" />
                  <span>Artha AI Chat</span>
                </div>
                <span className="nav-pill nav-pill-ai">AI</span>
              </NavLink>

              <NavLink to="/news" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconNews size={16} className="nav-icon" />
                  <span>News Intelligence</span>
                </div>
              </NavLink>

              <NavLink to="/backtesting" className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="nav-item-left">
                  <IconBacktest size={16} className="nav-icon" />
                  <span>Backtest Engine</span>
                </div>
              </NavLink>
            </nav>
          </div>

          {/* Sidebar Footer — Status & Account Info */}
          <div className="sidebar-system-card">
            <div className="system-status-header">
              <span className="system-status-title">SmartAPI Engine</span>
              <span className="system-status-indicator">
                <span className="status-dot-pulse" style={{ width: 5, height: 5 }} />
                Online
              </span>
            </div>
            <div className="system-metric-row">
              <span>Broker ID</span>
              <strong>AACI406579</strong>
            </div>
            <div className="system-metric-row">
              <span>Stream Latency</span>
              <strong style={{ color: 'var(--green)' }}>14ms</strong>
            </div>
            <div className="system-metric-row">
              <span>Risk Sentinel</span>
              <strong style={{ color: '#818cf8' }}>Active</strong>
            </div>
          </div>
        </aside>

        {/* Main Application Area */}
        <div className="app-main-wrapper">
          <TopNav />
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
      </div>
    </BrowserRouter>
  );
}
