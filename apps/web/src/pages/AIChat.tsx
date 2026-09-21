import React, { useState, useRef, useEffect } from 'react';
import { IconSparkles, IconBot, IconZap, IconTrendingUp, IconActivity, IconShieldCheck } from '../components/Icons';

const API_BASE = 'http://localhost:4000/api';

const SUGGESTIONS = [
  "Should I buy TCS today?",
  "What is my current drawdown?",
  "Analyse RELIANCE fundamentals",
  "What is the market regime?",
  "Screen for delivery opportunities",
  "Show open positions",
];

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  toolsUsed?: string[];
  suggestions?: Array<{ symbol: string; direction: string; confidence: number }>;
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: "Hello! I'm Artha AI Copilot — your autonomous quantitative portfolio agent.\n\nI dynamically orchestrate tools before every response:\n• Real-time Angel One SmartAPI tick feed\n• Fundamental valuation multiples (P/E, EPS, ROE)\n• Algorithmic market regime classification & sentiment\n• Portfolio heat & correlation-adjusted risk metrics\n\nAsk me about any stock, strategy, or risk allocation!",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(textToSend: string) {
    const msg = textToSend.trim();
    if (!msg) return;

    setMessages(m => [...m, { role: 'user', text: msg, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();

      setMessages(m => [...m, {
        role: 'assistant',
        text: data.reply ?? data.error ?? 'No response received from agent kernel.',
        timestamp: new Date(),
        toolsUsed: data.toolsUsed ?? [],
        suggestions: data.suggestions ?? [],
      }]);
    } catch {
      setMessages(m => [...m, {
        role: 'assistant',
        text: "❌ Service Notice: Failed to route prompt to AI Agent engine. Ensure backend API is active on port 4000.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2>
            Artha Quantitative AI Copilot
            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', borderColor: 'rgba(139, 92, 246, 0.3)' }}>
              AUTONOMOUS AGENT
            </span>
          </h2>
          <p className="description" style={{ margin: '4px 0 0' }}>
            Multi-tool autonomous reasoning engine with live broker state injection, risk calculations, and trade recommendations.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Main Chat Conversation Container */}
        <div style={{ flex: '1 1 540px', display: 'flex', flexDirection: 'column', height: '680px' }} className="card">
          {/* Scrollable messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 6 }}>
            {messages.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '82%' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', alignSelf: isUser ? 'flex-end' : 'flex-start', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isUser ? (
                        <>
                          <span style={{ fontWeight: 600, color: '#c7d2fe' }}>Trader</span>
                          <span>•</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: 700, color: '#a78bfa' }}>⚡ Artha Copilot</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {/* Tool Log — shown above assistant messages */}
                    {!isUser && m.toolsUsed && m.toolsUsed.length > 0 && (
                      <div style={{
                        background: 'rgba(99, 102, 241, 0.08)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginBottom: 2,
                      }}>
                        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 800, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          ⚡ Orchestrated Tools ({m.toolsUsed.length})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {m.toolsUsed.map((tool, ti) => (
                            <span key={ti} style={{
                              fontSize: 10.5,
                              color: 'var(--green)',
                              background: 'rgba(16, 185, 129, 0.1)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              ✓ {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div style={{
                      background: isUser
                        ? 'var(--accent-gradient)'
                        : 'rgba(13, 18, 29, 0.85)',
                      color: '#ffffff',
                      padding: '14px 18px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      border: isUser ? 'none' : '1px solid var(--border)',
                      boxShadow: isUser ? '0 4px 18px rgba(99,102,241,0.25)' : 'none',
                    }}>
                      {m.text}
                    </div>

                    {/* Inline suggestions from this message */}
                    {!isUser && m.suggestions && m.suggestions.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        {m.suggestions.map((s, si) => (
                          <div key={si} style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: s.direction === 'LONG'
                              ? 'rgba(16, 185, 129, 0.12)'
                              : 'rgba(244, 63, 94, 0.12)',
                            border: `1px solid ${s.direction === 'LONG' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
                            color: s.direction === 'LONG' ? 'var(--green)' : 'var(--red)',
                            fontWeight: 700,
                            fontFamily: 'JetBrains Mono, monospace'
                          }}>
                            {s.direction === 'LONG' ? '▲' : '▼'} {s.symbol} • {s.confidence}% Conf
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                <span className="status-dot-pulse" style={{ width: 6, height: 6, color: '#a78bfa' }} />
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  Agent evaluating market parameters & reasoning…
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input box */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Ask about NIFTY options, portfolio hedging, stock fundamentals..."
              style={{ flex: 1 }}
              disabled={loading}
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} className="primary" style={{ padding: '0 20px' }}>
              {loading ? 'Thinking…' : 'Send ➤'}
            </button>
          </div>
        </div>

        {/* Right Info & Quick Commands */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0 }}>
          {/* Suggested Queries */}
          <div className="card" style={{ padding: 18, margin: 0 }}>
            <h4 style={{ color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconSparkles size={14} color="#818cf8" />
              Quick Inquiries
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  className="secondary"
                  onClick={() => send(s)}
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    width: '100%',
                    color: 'var(--text-secondary)'
                  }}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Capability Matrix */}
          <div className="card" style={{ padding: 18, margin: 0 }}>
            <h4 style={{ color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Agent Capabilities
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { title: 'Live Feeds', desc: 'Real NSE/BSE quotes & depth', color: 'var(--green)' },
                { title: 'Fundamentals', desc: 'P/E, EPS, ROE, Debt/Equity', color: '#818cf8' },
                { title: 'Sentiment', desc: 'Financial news NLP pipeline', color: '#06b6d4' },
                { title: 'Regime Filter', desc: 'India VIX & volatility risk', color: '#fbbf24' },
              ].map(item => (
                <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Portfolio-Aware badge */}
          <div className="card" style={{ padding: 16, margin: 0, background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16,185,129,0.25)' }}>
            <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconShieldCheck size={15} />
              Portfolio-Aware Engine
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Artha automatically references your Angel One holdings before giving recommendations to avoid over-exposure.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
