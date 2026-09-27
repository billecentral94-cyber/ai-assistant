import React, { useState, useEffect } from 'react';
import { IconActivity, IconShieldCheck, IconZap } from './Icons';
import { useTheme } from '../contexts/ThemeContext';

interface TickerItem {
  symbol: string;
  price: string;
  change: string;
  isUp: boolean;
}

const DEFAULT_TICKERS: TickerItem[] = [
  { symbol: 'NIFTY 50', price: '24,541.15', change: '+0.42%', isUp: true },
  { symbol: 'BANK NIFTY', price: '51,820.40', change: '+0.58%', isUp: true },
  { symbol: 'FIN NIFTY', price: '23,190.25', change: '+0.31%', isUp: true },
  { symbol: 'SENSEX', price: '80,436.84', change: '+0.33%', isUp: true },
  { symbol: 'INDIA VIX', price: '13.45', change: '-1.82%', isUp: false },
  { symbol: 'CRUDE OIL', price: '₹6,285', change: '+0.74%', isUp: true },
  { symbol: 'GOLD 10G', price: '₹72,420', change: '+0.12%', isUp: true },
];

export const TopNav: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const [timeStr, setTimeStr] = useState<string>('');
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format in IST (UTC+5:30)
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      const formatter = new Intl.DateTimeFormat('en-IN', options);
      setTimeStr(formatter.format(now) + ' IST');

      // Check if Indian market is open (Mon-Fri, 9:15 to 15:30 IST)
      const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const day = istDate.getDay();
      const hours = istDate.getHours();
      const mins = istDate.getMinutes();
      const timeInMins = hours * 60 + mins;

      const isOpen = day >= 1 && day <= 5 && timeInMins >= (9 * 60 + 15) && timeInMins <= (15 * 60 + 30);
      setIsMarketOpen(isOpen);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="top-nav-bar">
      {/* Ticker tape scroll */}
      <div className="ticker-tape-container">
        <div className="ticker-tape-track">
          {DEFAULT_TICKERS.concat(DEFAULT_TICKERS).map((t, idx) => (
            <div key={`${t.symbol}-${idx}`} className="ticker-pill">
              <span className="ticker-name">{t.symbol}</span>
              <span className="ticker-price">{t.price}</span>
              <span className={`ticker-change ${t.isUp ? 'price-up' : 'price-down'}`}>
                {t.isUp ? '▲' : '▼'} {t.change}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right-hand meta badges */}
      <div className="top-nav-actions">
        {/* Market Status Pill */}
        <div className={`status-pill ${isMarketOpen ? 'pill-market-open' : 'pill-market-closed'}`}>
          <span className="status-dot-pulse" />
          <span className="status-label">
            {isMarketOpen ? 'NSE/BSE LIVE' : 'POST-MARKET'}
          </span>
          <span className="status-time">{timeStr}</span>
        </div>

        {/* Paper Trading Mode Badge */}
        <div className="mode-badge">
          <IconShieldCheck size={14} color="#10b981" />
          <span>Paper Mode</span>
          <span className="capital-tag">₹10,00,000</span>
        </div>

        {/* Broker Connectivity Pill */}
        <div className="broker-pill">
          <IconZap size={14} color="#6366f1" />
          <span>Angel One</span>
          <span className="broker-connected-dot" title="SmartAPI Connected" />
        </div>

        {/* Theme Toggle Button (Dark / Light) */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
            color: isDark ? '#fbbf24' : '#6366f1',
            cursor: 'pointer',
            boxShadow: 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {isDark ? (
            /* Sun Icon */
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            /* Moon Icon */
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
};
