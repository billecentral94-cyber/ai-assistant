import React, { useState, useEffect } from 'react';
import { IconActivity, IconShieldCheck, IconZap } from './Icons';

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
      </div>
    </header>
  );
};
