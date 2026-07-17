import { useEffect, useState } from 'react';
import { getNews } from '../services/api';

export default function NewsIntelligence() {
  const [items, setItems] = useState<Array<{ headline: string; source: string; sentiment: string }>>([]);

  useEffect(() => {
    getNews().then(setItems).catch(() => {});
  }, []);

  return (
    <div>
      <h2>News Intelligence <span className="badge">Phase 10 — stub</span></h2>
      {items.map((item, i) => (
        <div className="card" key={i}>
          <div>{item.headline}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.source} · {item.sentiment}</div>
        </div>
      ))}
    </div>
  );
}
