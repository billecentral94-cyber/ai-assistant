import { useEffect, useState, useCallback } from 'react';

export interface AgentSuggestion {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  strategy: string;
  reasoning: string;
  target?: number;
  stopLoss?: number;
  fundamentalRating?: string;
  sentimentScore?: number;
  generatedAt: string;
}

interface SuggestionBoxProps {
  onSuggestionClick?: (suggestion: AgentSuggestion) => void;
}

const API_BASE = 'http://localhost:4000/api';

// Request browser notification permission
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

// Send browser push notification
function sendNotification(suggestion: AgentSuggestion) {
  if (Notification.permission !== 'granted') return;

  const dirEmoji = suggestion.direction === 'LONG' ? '📈' : '📉';
  const n = new Notification(`${dirEmoji} Artha AI — ${suggestion.symbol}`, {
    body: `${suggestion.direction} signal | Confidence: ${suggestion.confidence}% | Strategy: ${suggestion.strategy.toUpperCase()}`,
    icon: '/favicon.ico',
    tag: `artha-${suggestion.symbol}`,
    requireInteraction: false,
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };

  // Auto-close after 8 seconds
  setTimeout(() => n.close(), 8000);
}

export default function SuggestionBox({ onSuggestionClick }: SuggestionBoxProps) {
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [screening, setScreening] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [notifiedSymbols] = useState(new Set<string>());

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotifEnabled(Notification.permission === 'granted');
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/agent/suggestions`);
      const data = await res.json();
      if (Array.isArray(data.suggestions)) {
        const newSuggestions: AgentSuggestion[] = data.suggestions;
        setSuggestions(newSuggestions);
        setLastUpdated(data.lastScreenedAt);

        // Send notifications for new high-confidence suggestions
        if (notifEnabled) {
          newSuggestions
            .filter(s => s.confidence >= 70 && !notifiedSymbols.has(s.symbol))
            .forEach(s => {
              sendNotification(s);
              notifiedSymbols.add(s.symbol);
            });
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [notifEnabled, notifiedSymbols]);

  // Poll for suggestions every 60 seconds
  useEffect(() => {
    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 60_000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifEnabled(granted);
    if (granted) {
      fetchSuggestions(); // refetch to send any pending notifications
    }
  };

  const handleScreen = async () => {
    setScreening(true);
    try {
      const res = await fetch(`${API_BASE}/agent/screen`, { method: 'POST' });
      const data = await res.json();
      if (Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
        setLastUpdated(data.timestamp);
      }
    } catch {
      // ignore
    } finally {
      setScreening(false);
    }
  };

  const handleDismiss = async (symbol: string) => {
    try {
      await fetch(`${API_BASE}/agent/suggestions/${symbol}`, { method: 'DELETE' });
      setSuggestions(prev => prev.filter(s => s.symbol !== symbol));
    } catch {
      setSuggestions(prev => prev.filter(s => s.symbol !== symbol));
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return '#10b981'; // green
    if (confidence >= 70) return '#a78bfa'; // purple
    if (confidence >= 60) return '#f59e0b'; // amber
    return '#6b7280'; // gray
  };

  const getRatingBadge = (rating?: string) => {
    if (!rating) return null;
    const colors: Record<string, string> = {
      STRONG_BUY: '#10b981',
      BUY: '#34d399',
      HOLD: '#f59e0b',
      SELL: '#f87171',
      STRONG_SELL: '#ef4444',
    };
    return (
      <span style={{
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 4,
        background: `${colors[rating] ?? '#6b7280'}22`,
        color: colors[rating] ?? '#6b7280',
        border: `1px solid ${colors[rating] ?? '#6b7280'}44`,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}>
        {rating.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(167, 139, 250, 0.2)',
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            🤖 AI Suggestion Box
            {suggestions.length > 0 && (
              <span style={{
                background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
                color: '#fff',
                borderRadius: 12,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
              }}>
                {suggestions.length} active
              </span>
            )}
          </h3>
          {lastUpdated && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Last screened: {new Date(lastUpdated).toLocaleTimeString('en-IN')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {!notifEnabled && (
            <button
              onClick={handleEnableNotifications}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 8,
                color: '#f59e0b',
                cursor: 'pointer',
              }}
            >
              🔔 Enable Alerts
            </button>
          )}
          {notifEnabled && (
            <span style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
              🔔 Alerts ON
            </span>
          )}
          <button
            onClick={handleScreen}
            disabled={screening}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              background: 'linear-gradient(135deg, #a78bfa22, #7c3aed22)',
              border: '1px solid rgba(167, 139, 250, 0.4)',
              borderRadius: 8,
              color: '#a78bfa',
              cursor: screening ? 'not-allowed' : 'pointer',
              opacity: screening ? 0.6 : 1,
            }}
          >
            {screening ? '⏳ Screening…' : '🔍 Screen Now'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && suggestions.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>
          ⏳ Loading suggestions…
        </div>
      )}

      {/* Empty State */}
      {!loading && suggestions.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '24px 0',
          color: 'var(--muted)',
          fontSize: 13,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          <div>No active suggestions. Click <strong>"Screen Now"</strong> to run AI analysis.</div>
        </div>
      )}

      {/* Suggestion Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {suggestions.map(s => (
          <div
            key={s.symbol}
            onClick={() => onSuggestionClick?.(s)}
            style={{
              background: s.direction === 'LONG'
                ? 'rgba(16, 185, 129, 0.05)'
                : 'rgba(239, 68, 68, 0.05)',
              border: `1px solid ${s.direction === 'LONG' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              borderRadius: 12,
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(4px)';
              (e.currentTarget as HTMLDivElement).style.borderColor = s.direction === 'LONG' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)';
              (e.currentTarget as HTMLDivElement).style.borderColor = s.direction === 'LONG' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* Left: symbol + direction */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: s.direction === 'LONG' ? '#10b981' : '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {s.direction === 'LONG' ? '▲' : '▼'} {s.symbol}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(167, 139, 250, 0.15)',
                      color: '#a78bfa',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {s.strategy}
                    </span>
                    {getRatingBadge(s.fundamentalRating)}
                  </div>
                </div>
              </div>

              {/* Right: confidence + dismiss */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: getConfidenceColor(s.confidence),
                  }}>
                    {s.confidence}%
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>confidence</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDismiss(s.symbol); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: 4,
                    borderRadius: 4,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'; }}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Confidence bar */}
            <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${s.confidence}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${getConfidenceColor(s.confidence)}, ${getConfidenceColor(s.confidence)}aa)`,
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }} />
            </div>

            {/* Reasoning preview */}
            {s.reasoning && (
              <div style={{
                marginTop: 8,
                fontSize: 11,
                color: 'var(--muted)',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
              }}>
                {s.reasoning.slice(0, 120)}…
              </div>
            )}

            {/* Target / Stop */}
            {(s.target || s.stopLoss) && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                {s.target && (
                  <span style={{ fontSize: 11, color: '#10b981' }}>
                    🎯 Target: ₹{s.target}
                  </span>
                )}
                {s.stopLoss && (
                  <span style={{ fontSize: 11, color: '#ef4444' }}>
                    🛑 Stop: ₹{s.stopLoss}
                  </span>
                )}
              </div>
            )}

            {/* Time */}
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
              Generated {new Date(s.generatedAt).toLocaleTimeString('en-IN')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
