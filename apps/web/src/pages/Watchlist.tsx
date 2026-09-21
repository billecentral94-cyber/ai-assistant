import { useEffect, useState } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getWatchlist, getCandles } from '../services/api';

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number;
  ema50?: number;
}

// Custom Candlestick shape for Recharts utilizing yAxis.scale
const CandlestickShape = (props: any) => {
  try {
    const { x, width, payload, yAxis } = props;

    if (typeof window !== 'undefined') {
      (window as any).__recharts_debug = {
        hasYAxis: !!yAxis,
        yAxisKeys: yAxis ? Object.keys(yAxis) : [],
        scaleType: yAxis ? typeof yAxis.scale : 'undefined',
        hasYScale: !!props.yScale,
        yScaleType: typeof props.yScale,
        propKeys: Object.keys(props)
      };
    }

    if (!payload || !yAxis || typeof yAxis.scale !== 'function') return null;

    const open = Number(payload.open);
    const close = Number(payload.close);
    const high = Number(payload.high);
    const low = Number(payload.low);

    if (isNaN(open) || isNaN(close) || isNaN(high) || isNaN(low)) return null;

    const yScale = yAxis.scale;

    const isUp = close >= open;
    const strokeColor = isUp ? 'var(--green)' : 'var(--red)';

    const topVal = yScale(Math.max(open, close));
    const bottomVal = yScale(Math.min(open, close));
    const highVal = yScale(high);
    const lowVal = yScale(low);

    if (isNaN(topVal) || isNaN(bottomVal) || isNaN(highVal) || isNaN(lowVal)) return null;

    const bodyHeight = Math.max(2, bottomVal - topVal);
    const centerX = x + width / 2;

    return (
      <g>
        {/* Wick (vertical line) */}
        <line
          x1={centerX}
          y1={highVal}
          x2={centerX}
          y2={lowVal}
          stroke={strokeColor}
          strokeWidth={1.5}
        />
        {/* Body (rectangle) */}
        <rect
          x={x}
          y={topVal}
          width={width}
          height={bodyHeight}
          fill={isUp ? 'var(--green)' : 'var(--red)'}
          stroke={strokeColor}
          strokeWidth={1}
        />
      </g>
    );
  } catch (err) {
    console.error('Error rendering CandlestickShape:', err);
    return null;
  }
};

export default function Watchlist() {
  const [symbols, setSymbols] = useState<Array<{ ticker: string; exchange: string }>>([]);
  const [selected, setSelected] = useState('RELIANCE');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState('1m');
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Visual debugger state
  const [debugText, setDebugText] = useState('No debug data recorded yet.');

  useEffect(() => {
    const t = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).__recharts_debug) {
        setDebugText(JSON.stringify((window as any).__recharts_debug, null, 2));
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getWatchlist().then(setSymbols).catch(() => {});
  }, []);

  useEffect(() => {
    getCandles(selected, timeframe).then(rawCandles => {
      if (!Array.isArray(rawCandles)) {
        setCandles([]);
        setHoveredCandle(null);
        return;
      }

      // Compute indicators dynamically
      const enriched: CandleData[] = rawCandles.map((c: any, index: number) => {
        const item: CandleData = { ...c };
        
        // Compute SMA20
        if (index >= 19) {
          const sum = rawCandles.slice(index - 19, index + 1).reduce((acc: number, val: any) => acc + val.close, 0);
          item.sma20 = sum / 20;
        }

        // Compute EMA50
        if (index >= 49) {
          const k = 2 / (50 + 1);
          let prevEma = item.close;
          if (index > 49) {
            prevEma = enriched[index - 1].ema50 || item.close;
          }
          item.ema50 = item.close * k + prevEma * (1 - k);
        }

        return item;
      });

      setCandles(enriched);
      if (enriched.length > 0) {
        setHoveredCandle(enriched[enriched.length - 1]); // default to latest
      } else {
        setHoveredCandle(null);
      }
    }).catch(() => {
      setCandles([]);
      setHoveredCandle(null);
    });
  }, [selected, timeframe]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    setSearchError(null);
    setSearching(true);

    try {
      // Test fetch candles for search validation
      const res = await getCandles(query, timeframe);
      if (Array.isArray(res) && res.length > 0) {
        // If not in watchlist, append it
        if (!symbols.some(s => s.ticker === query)) {
          setSymbols(prev => [...prev, { ticker: query, exchange: 'NSE' }]);
        }
        setSelected(query);
        setSearchQuery('');
      } else {
        setSearchError('Symbol not found on Yahoo Finance. Try e.g. WIPRO, SBIN, or AAPL');
      }
    } catch {
      setSearchError('Failed to fetch candles. Verify ticker symbol.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <h2>Interactive Charting Terminal <span className="badge">TradingView Style</span></h2>
      <p className="description">
        Professional candlestick charts complete with SMA20/EMA50 overlays, volume bars, and crosshair metrics mapping.
      </p>

      {/* Search form bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Search symbol (e.g. WIPRO, SBIN, AAPL)..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          disabled={searching}
          style={{ 
            padding: '10px 16px', 
            borderRadius: 8, 
            border: '1px solid var(--border)', 
            background: 'rgba(255,255,255,0.03)', 
            color: '#fff', 
            width: 300,
            fontSize: 13
          }}
        />
        <button type="submit" disabled={searching} style={{ padding: '10px 24px', fontSize: 13 }}>
          {searching ? '🔍 Searching...' : 'Search Ticker'}
        </button>
      </form>

      {searchError && (
        <div style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
          ⚠️ {searchError}
        </div>
      )}

      {/* Symbol watch buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, flexWrap: 'wrap', gap: 15 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {symbols.map(s => {
            const isSelected = selected === s.ticker;
            return (
              <button
                key={s.ticker}
                onClick={() => setSelected(s.ticker)}
                className={isSelected ? '' : 'secondary'}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13 }}
              >
                {s.ticker}
              </button>
            );
          })}
        </div>

        {/* Timeframe Selectors */}
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {['1m', '5m', '15m', 'Daily'].map(tf => {
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={active ? '' : 'secondary'}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  boxShadow: 'none',
                  background: active ? 'var(--accent-gradient)' : 'transparent',
                  border: 'none'
                }}
              >
                {tf}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info bar showing OHLC details at cursor */}
      {hoveredCandle && (
        <div style={{ 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid var(--border)', 
          borderRadius: 10, 
          padding: '10px 20px', 
          marginBottom: 15,
          display: 'flex',
          gap: 20,
          fontSize: 13,
          fontFamily: 'monospace',
          color: 'var(--muted)',
          flexWrap: 'wrap'
        }}>
          <span>Symbol: <strong style={{ color: '#fff' }}>{selected}</strong></span>
          <span>Open: <strong style={{ color: 'var(--text)' }}>₹{(hoveredCandle.open ?? 0).toFixed(2)}</strong></span>
          <span>High: <strong style={{ color: 'var(--green)' }}>₹{(hoveredCandle.high ?? 0).toFixed(2)}</strong></span>
          <span>Low: <strong style={{ color: 'var(--red)' }}>₹{(hoveredCandle.low ?? 0).toFixed(2)}</strong></span>
          <span>Close: <strong style={{ color: (hoveredCandle.close ?? 0) >= (hoveredCandle.open ?? 0) ? 'var(--green)' : 'var(--red)' }}>₹{(hoveredCandle.close ?? 0).toFixed(2)}</strong></span>
          <span>Vol: <strong style={{ color: 'var(--text)' }}>{(hoveredCandle.volume ?? 0).toLocaleString()}</strong></span>
          {hoveredCandle.sma20 && <span>SMA20: <strong style={{ color: '#60a5fa' }}>₹{hoveredCandle.sma20.toFixed(2)}</strong></span>}
          {hoveredCandle.ema50 && <span>EMA50: <strong style={{ color: '#a78bfa' }}>₹{hoveredCandle.ema50.toFixed(2)}</strong></span>}
        </div>
      )}

      {/* Chart Card */}
      <div className="card" style={{ minHeight: 460, padding: '24px 20px 10px 10px' }}>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={candles}
            onMouseMove={(state: any) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                setHoveredCandle(state.activePayload[0].payload);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={v => {
                try {
                  const d = new Date(v as string);
                  if (isNaN(d.getTime())) return '';
                  return timeframe === 'Daily'
                    ? d.toLocaleDateString([], { month: 'short', day: '2-digit' })
                    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } catch {
                  return '';
                }
              }}
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            
            {/* Price axis */}
            <YAxis 
              yAxisId="price"
              domain={['auto', 'auto']} 
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              orientation="right"
              tickFormatter={v => `₹${Number(v).toFixed(0)}`}
            />

            {/* Volume axis */}
            <YAxis 
              yAxisId="volume"
              domain={[0, (data: any) => {
                if (!Array.isArray(data) || data.length === 0) return 1000;
                const max = Math.max(...data.map((c: any) => c?.volume ?? 0));
                return max > 0 ? max * 4 : 1000;
              }]}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              content={<div style={{ display: 'none' }} />} // Handled by info bar overhead
            />

            {/* Volume Bars */}
            <Bar 
              yAxisId="volume"
              dataKey="volume" 
              fill="rgba(99, 102, 241, 0.08)"
              radius={[4, 4, 0, 0]}
            />

            {/* Candlesticks - custom shape using d3 scale directly */}
            <Bar
              yAxisId="price"
              dataKey="close"
              shape={<CandlestickShape />}
            />

            {/* Overlay indicators */}
            <Line 
              yAxisId="price"
              type="monotone" 
              dataKey="sma20" 
              stroke="#60a5fa" 
              dot={false} 
              strokeWidth={1.5}
              connectNulls
            />
            <Line 
              yAxisId="price"
              type="monotone" 
              dataKey="ema50" 
              stroke="#a78bfa" 
              dot={false} 
              strokeWidth={1.5}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', gap: 15, marginTop: 10, paddingLeft: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 12, height: 3, background: '#60a5fa' }} />
          SMA20
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 12, height: 3, background: '#a78bfa' }} />
          EMA50
        </div>
      </div>

      {/* Optional Diagnostics Toggle */}
      <details style={{ marginTop: 24, padding: '10px 14px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        <summary style={{ color: 'var(--muted)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
          🔧 Developer Diagnostics
        </summary>
        <pre style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginTop: 10 }}>
          {debugText}
        </pre>
      </details>
    </div>
  );
}
