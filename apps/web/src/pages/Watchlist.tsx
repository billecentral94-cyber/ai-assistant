import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { getWatchlist, getCandles } from '../services/api';
import { IconSearch, IconAlertTriangle } from '../components/Icons';

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

export default function Watchlist() {
  const [symbols, setSymbols] = useState<Array<{ ticker: string; exchange: string }>>([]);
  const [selected, setSelected] = useState('RELIANCE');
  const [timeframe, setTimeframe] = useState('1m');
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Chart DOM reference
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Load watchlist on mount
  useEffect(() => {
    getWatchlist().then(setSymbols).catch(() => {});
  }, []);

  // Initialize TradingView Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart instance if present
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: '#07090E' },
        textColor: '#94a3b8',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: 3,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // 1. Candlestick Series (Actual Japanese Candlesticks)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // 2. Volume Histogram Series (Below candlesticks)
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(99, 102, 241, 0.25)',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // Overlay
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // 3. Technical Indicator Overlays
    const smaSeries = chart.addLineSeries({
      color: '#60a5fa',
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });

    const emaSeries = chart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });

    // Crosshair hover tracking for OHLC display
    chart.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.seriesData) {
        return;
      }
      const data = param.seriesData.get(candleSeries) as any;
      if (data) {
        setHoveredCandle({
          timestamp: typeof param.time === 'number'
            ? new Date(param.time * 1000).toISOString()
            : String(param.time),
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 0,
        });
      }
    });

    // Auto-resize on window / container resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Fetch and update candlestick data when symbol or timeframe changes
  useEffect(() => {
    let isMounted = true;
    getCandles(selected, timeframe).then(rawCandles => {
      if (!isMounted || !Array.isArray(rawCandles) || rawCandles.length === 0) return;

      // 1. Format and deduplicate time-series for Lightweight Charts (ascending order required)
      const formatted = rawCandles
        .map(c => {
          const t = Math.floor(new Date(c.timestamp).getTime() / 1000);
          return {
            time: t as any,
            open: parseFloat(Number(c.open).toFixed(2)),
            high: parseFloat(Number(c.high).toFixed(2)),
            low: parseFloat(Number(c.low).toFixed(2)),
            close: parseFloat(Number(c.close).toFixed(2)),
            volume: Math.round(Number(c.volume || 0)),
          };
        })
        .filter(c => !isNaN(c.time) && c.open > 0 && c.close > 0)
        .sort((a, b) => a.time - b.time);

      // Deduplicate timestamps (Lightweight Charts strict requirement)
      const uniqueCandles: any[] = [];
      const seenTimes = new Set<number>();
      for (const item of formatted) {
        if (!seenTimes.has(item.time)) {
          seenTimes.add(item.time);
          uniqueCandles.push(item);
        }
      }

      if (uniqueCandles.length === 0) return;

      // 2. Compute SMA20 & EMA50
      const smaData: Array<{ time: any; value: number }> = [];
      const emaData: Array<{ time: any; value: number }> = [];

      for (let i = 0; i < uniqueCandles.length; i++) {
        if (i >= 19) {
          const sum = uniqueCandles.slice(i - 19, i + 1).reduce((acc, v) => acc + v.close, 0);
          smaData.push({ time: uniqueCandles[i].time, value: parseFloat((sum / 20).toFixed(2)) });
        }
        if (i >= 49) {
          const k = 2 / (50 + 1);
          const prevEma = emaData.length > 0 ? emaData[emaData.length - 1].value : uniqueCandles[i].close;
          const emaVal = uniqueCandles[i].close * k + prevEma * (1 - k);
          emaData.push({ time: uniqueCandles[i].time, value: parseFloat(emaVal.toFixed(2)) });
        }
      }

      // 3. Set data in TradingView chart series
      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(uniqueCandles);
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          uniqueCandles.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
          }))
        );
      }
      if (smaSeriesRef.current) {
        smaSeriesRef.current.setData(smaData);
      }
      if (emaSeriesRef.current) {
        emaSeriesRef.current.setData(emaData);
      }

      // 4. Default header to latest candle
      const latest = uniqueCandles[uniqueCandles.length - 1];
      setHoveredCandle({
        timestamp: new Date(latest.time * 1000).toISOString(),
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        volume: latest.volume,
        sma20: smaData.length > 0 ? smaData[smaData.length - 1].value : undefined,
        ema50: emaData.length > 0 ? emaData[emaData.length - 1].value : undefined,
      });

      // Fit chart view to content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }).catch(err => {
      console.warn('[Watchlist] Error loading candles:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [selected, timeframe]);

  // Handle ticker search
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    setSearchError(null);
    setSearching(true);

    try {
      const res = await getCandles(query, timeframe);
      if (Array.isArray(res) && res.length > 0) {
        if (!symbols.some(s => s.ticker === query)) {
          setSymbols(prev => [...prev, { ticker: query, exchange: 'NSE' }]);
        }
        setSelected(query);
        setSearchQuery('');
      } else {
        setSearchError(`Symbol ${query} not found on NSE. Try e.g. WIPRO, SBIN, or AAPL`);
      }
    } catch {
      setSearchError('Failed to fetch candles. Verify ticker symbol.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <h2>Interactive Charting Terminal <span className="badge">TradingView Powered</span></h2>
      <p className="description">
        Institutional Japanese candlestick charts with high-performance WebGL rendering, volume profile, SMA20/EMA50 overlays, and crosshair metrics tracking.
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
            fontSize: 13,
          }}
        />
        <button type="submit" disabled={searching} style={{ padding: '10px 22px', fontSize: 13, gap: 6 }}>
          <IconSearch size={14} />
          {searching ? 'Searching...' : 'Search Ticker'}
        </button>
      </form>

      {searchError && (
        <div style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconAlertTriangle size={15} color="var(--red)" />
          {searchError}
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
                  border: 'none',
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
          flexWrap: 'wrap',
        }}>
          <span>Symbol: <strong style={{ color: '#fff' }}>{selected}</strong></span>
          <span>Open: <strong style={{ color: 'var(--text)' }}>₹{(hoveredCandle.open ?? 0).toFixed(2)}</strong></span>
          <span>High: <strong style={{ color: 'var(--green)' }}>₹{(hoveredCandle.high ?? 0).toFixed(2)}</strong></span>
          <span>Low: <strong style={{ color: 'var(--red)' }}>₹{(hoveredCandle.low ?? 0).toFixed(2)}</strong></span>
          <span>Close: <strong style={{ color: (hoveredCandle.close ?? 0) >= (hoveredCandle.open ?? 0) ? 'var(--green)' : 'var(--red)' }}>₹{(hoveredCandle.close ?? 0).toFixed(2)}</strong></span>
          {hoveredCandle.volume > 0 && <span>Vol: <strong style={{ color: 'var(--text)' }}>{(hoveredCandle.volume ?? 0).toLocaleString()}</strong></span>}
          {hoveredCandle.sma20 && <span>SMA20: <strong style={{ color: '#60a5fa' }}>₹{hoveredCandle.sma20.toFixed(2)}</strong></span>}
          {hoveredCandle.ema50 && <span>EMA50: <strong style={{ color: '#a78bfa' }}>₹{hoveredCandle.ema50.toFixed(2)}</strong></span>}
        </div>
      )}

      {/* Actual TradingView Candlestick Chart Container */}
      <div className="card" style={{ padding: 16, background: '#07090E', border: '1px solid var(--border)' }}>
        <div ref={chartContainerRef} style={{ width: '100%', height: 440 }} />
      </div>

      {/* Indicator Legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingLeft: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#10b981' }} />
          Bullish Candle
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#ef4444' }} />
          Bearish Candle
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 12, height: 3, background: '#60a5fa' }} />
          SMA20
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 12, height: 3, background: '#a78bfa' }} />
          EMA50
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 10, background: 'rgba(99, 102, 241, 0.4)' }} />
          Volume Bars
        </div>
      </div>
    </div>
  );
}
