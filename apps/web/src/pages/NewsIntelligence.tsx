import { useEffect, useState } from 'react';
import { getNews } from '../services/api';

interface NewsItem {
  headline: string;
  source: string;
  sentiment: string;
  symbol: string;
  impact: string;
}

interface CorporateEvent {
  symbol: string;
  eventType: string;
  date: string;
  description: string;
  blackoutHours: number;
  status: string;
}

export default function NewsIntelligence() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<CorporateEvent[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getNews();
        setItems(data.items);
        setEvents(data.corporateEvents);
        setLastUpdated(data.lastUpdated);
      } catch {
        // keep empty state
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const impactColor: Record<string, string> = {
    HIGH: 'var(--red)',
    MEDIUM: '#f59e0b',
    LOW: 'var(--green)',
  };

  return (
    <div>
      <h2>News & Event Intelligence <span className="badge">Auto-Refresh</span></h2>
      <p className="description">
        Real-time sentiment feeds and corporate event schedules. Signals for blacklisted symbols are automatically suppressed by the NewsEventGuard.
      </p>

      {/* Corporate Blackout Alerts */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ padding: '24px 24px 10px 24px' }}>
          <h3 style={{ color: '#fff', fontSize: 17 }}>Upcoming Corporate Event Blackouts</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            Trading signals for these symbols will be automatically suppressed during blackout periods.
          </p>
        </div>
        <table style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Event Type</th>
              <th>Scheduled Date</th>
              <th>Description</th>
              <th>Blackout Window</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 600, color: '#fff' }}>{e.symbol}</td>
                <td>
                  <span className={`badge ${e.eventType === 'SEBI_NOTICE' ? 'danger' : e.eventType === 'EARNINGS' ? 'success' : ''}`}>
                    {e.eventType}
                  </span>
                </td>
                <td>{e.date}</td>
                <td style={{ color: 'var(--muted)' }}>{e.description}</td>
                <td>{e.blackoutHours} Hours</td>
                <td>
                  <span className={`badge ${e.status === 'ACTIVE' ? 'danger' : ''}`}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sentiment Scanner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <h3 style={{ color: '#fff', fontSize: 18 }}>Real-Time Sentiment Scanner</h3>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Updated: {new Date(lastUpdated).toLocaleTimeString('en-IN')}
          </span>
        )}
      </div>

      {loading && <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>Loading news feed…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, i) => {
          const isPositive = item.sentiment === 'positive';
          const isNegative = item.sentiment === 'negative';

          return (
            <div className="card" key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', margin: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '75%' }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>{item.headline}</div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.source}</span>
                  <span>•</span>
                  <span className="badge" style={{ fontSize: 10, padding: '1px 7px' }}>{item.symbol}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`badge ${isPositive ? 'success' : isNegative ? 'danger' : ''}`} style={{ minWidth: 80, justifyContent: 'center' }}>
                  {item.sentiment.toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: impactColor[item.impact] ?? 'var(--muted)', fontWeight: 600 }}>
                  {item.impact} IMPACT
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
