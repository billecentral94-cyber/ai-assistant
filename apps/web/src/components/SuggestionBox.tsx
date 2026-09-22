import React, { useEffect, useState, useCallback } from 'react';
import { IconSparkles, IconRefresh, IconBell, IconClose, IconZap } from './Icons';

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

async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

function sendNotification(suggestion: AgentSuggestion) {
  if (Notification.permission !== 'granted') return;

  const n = new Notification(`Artha AI — ${suggestion.symbol}`, {
    body: `${suggestion.direction} Signal | Confidence: ${suggestion.confidence}% | Strategy: ${suggestion.strategy.toUpperCase()}`,
    icon: '/favicon.ico',
    tag: `artha-${suggestion.symbol}`,
    requireInteraction: false,
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };

  setTimeout(() => n.close(), 8000);
}

export default function SuggestionBox({ onSuggestionClick }: SuggestionBoxProps) {
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [screening, setScreening] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [notifiedSymbols] = useState(new Set<string>());

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

  useEffect(() => {
    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 60_000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifEnabled(granted);
    if (granted) {
      fetchSuggestions();
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
    if (confidence >= 80) return 'var(--green)';
    if (confidence >= 70) return '#818cf8';
    if (confidence >= 60) return '#fbbf24';
    return '#64748b';
  };

  return (
    <div className="card" style={{
      background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.75) 0%, rgba(13, 18, 29, 0.9) 100%)',
      border: '1px solid rgba(99, 102, 241, 0.22)',
      borderRadius: 14,
      padding: '22px 24px',
      marginBottom: 28,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <IconSparkles size={17} color="#a78bfa" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>
                Quantitative Intelligence Signals
              </h3>
              {suggestions.length > 0 && (
                <span className="badge success" style={{ fontSize: 9.5 }}>
                  {suggestions.length} Active Setups
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {lastUpdated ? `Last screened: ${new Date(lastUpdated).toLocaleTimeString('en-IN')}` : 'Algorithmic multi-factor signal matrix'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!notifEnabled && (
            <button
              onClick={handleEnableNotifications}
              className="secondary"
              style={{ padding: '6px 12px', fontSize: 11.5, gap: 6 }}
            >
              <IconBell size={13} color="var(--text-secondary)" /> Enable Alerts
            </button>
          )}
          {notifEnabled && (
            <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <span className="status-dot-pulse" style={{ width: 6, height: 6 }} /> Alerts Active
            </span>
          )}
          <button
            onClick={handleScreen}
            disabled={screening}
            className="primary"
            style={{ padding: '6px 14px', fontSize: 12, gap: 6 }}
          >
            <IconRefresh size={13} style={{ animation: screening ? 'spin 1s linear infinite' : 'none' }} />
            {screening ? 'Running Screener…' : 'Screen Setups'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && suggestions.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '24px 0' }}>
          Scanning equity & derivative order flows…
        </div>
      )}

      {/* Empty State */}
      {!loading && suggestions.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '28px 0',
          color: 'var(--muted)',
          fontSize: 13,
          background: 'rgba(255, 255, 255, 0.01)',
          borderRadius: 10,
          border: '1px dashed var(--border-subtle)'
        }}>
          <div>No active signals found. Click <strong>Screen Setups</strong> to execute multi-factor quantitative screening.</div>
        </div>
      )}

      {/* Suggestion Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {suggestions.map(s => (
          <div
            key={s.symbol}
            onClick={() => onSuggestionClick?.(s)}
            style={{
              background: s.direction === 'LONG'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(13, 18, 29, 0.6) 100%)'
                : 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(13, 18, 29, 0.6) 100%)',
              border: `1px solid ${s.direction === 'LONG' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLDivElement).style.borderColor = s.direction === 'LONG' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(244, 63, 94, 0.5)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLDivElement).style.borderColor = s.direction === 'LONG' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 15,
                    fontWeight: 800,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#ffffff'
                  }}>
                    {s.symbol}
                  </span>
                  <span className={`badge ${s.direction === 'LONG' ? 'success' : 'danger'}`}>
                    {s.direction === 'LONG' ? 'LONG' : 'SHORT'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a78bfa',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4
                  }}>
                    {s.strategy}
                  </span>
                  {s.fundamentalRating && (
                    <span className="badge warning" style={{ fontSize: 9.5 }}>
                      {s.fundamentalRating}
                    </span>
                  )}
                </div>
              </div>

              {/* Confidence Meter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: getConfidenceColor(s.confidence),
                  }}>
                    {s.confidence}%
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Confidence</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDismiss(s.symbol); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: 4,
                    boxShadow: 'none'
                  }}
                  title="Dismiss"
                >
                  <IconClose size={14} color="var(--muted)" />
                </button>
              </div>
            </div>

            {/* Confidence Progress Bar */}
            <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 999, height: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${s.confidence}%`,
                height: '100%',
                background: getConfidenceColor(s.confidence),
                borderRadius: 999,
                transition: 'width 0.6s ease',
              }} />
            </div>

            {/* Reasoning Preview */}
            {s.reasoning && (
              <div style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
              }}>
                {s.reasoning}
              </div>
            )}

            {/* Target & Stop Loss Levels */}
            {(s.target || s.stopLoss) && (
              <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                {s.target && (
                  <span style={{ color: 'var(--green)' }}>
                    TARGET: ₹{s.target.toLocaleString('en-IN')}
                  </span>
                )}
                {s.stopLoss && (
                  <span style={{ color: 'var(--red)' }}>
                    SL: ₹{s.stopLoss.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
