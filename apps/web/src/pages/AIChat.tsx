import { useState } from 'react';
import { sendChatMessage } from '../services/api';

export default function AIChat() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [input, setInput] = useState('');

  async function send() {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(m => [...m, { role: 'user', text: userMsg }]);
    setInput('');
    const res = await sendChatMessage(userMsg);
    setMessages(m => [...m, { role: 'assistant', text: res.reply }]);
  }

  return (
    <div>
      <h2>AI Copilot <span className="badge">Phase 10 — stub reply</span></h2>
      <div className="card" style={{ minHeight: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
            <div style={{
              background: m.role === 'user' ? 'var(--accent)' : '#1b2530',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 14,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about a stock, your portfolio, or a strategy…"
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)',
          }}
        />
        <button
          onClick={send}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
