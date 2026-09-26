import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine, CandlestickData, Time } from 'lightweight-charts';
import { getWatchlist, getCandles } from '../services/api';
import { IconSearch, IconAlertTriangle } from '../components/Icons';

/* ── Types ───────────────────────────────────────────────────────────── */
interface OHLCVData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LegendData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  sma20?: number;
  ema50?: number;
}

/* ── Timeframe config ────────────────────────────────────────────────── */
const TIMEFRAMES = [
  { label: '1m',    value: '1m',    period: '5d',  interval: '1m'  },
  { label: '5m',    value: '5m',    period: '5d',  interval: '5m'  },
  { label: '15m',   value: '15m',   period: '5d',  interval: '15m' },
  { label: '1H',    value: '1h',    period: '1mo', interval: '60m' },
  { label: '1D',    value: 'Daily', period: '3mo', interval: '1d'  },
];

/* ── Color palette (professional dark terminal) ──────────────────────── */
const COLORS = {
  bg:           '#07090E',
  gridLine:     'rgba(255, 255, 255, 0.03)',
  crosshair:    'rgba(148, 163, 184, 0.35)',
  bullCandle:   '#10b981',
  bearCandle:   '#ef4444',
  bullVolume:   'rgba(16, 185, 129, 0.25)',
  bearVolume:   'rgba(239, 68, 68, 0.25)',
  sma20:        '#60a5fa',
  ema50:        '#a78bfa',
  textPrimary:  '#e2e8f0',
  textMuted:    '#64748b',
  borderColor:  'rgba(255, 255, 255, 0.06)',
  priceLine:    'rgba(99, 102, 241, 0.6)',
};

export default function Watchlist() {
  const [symbols, setSymbols] = useState<Array<{ ticker: string; exchange: string }>>([]);
  const [selected, setSelected] = useState('RELIANCE');
  const [activeTimeframe, setActiveTimeframe] = useState('1m');
  const [legend, setLegend] = useState<LegendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<'live' | 'loading' | 'offline'>('loading');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [barCount, setBarCount] = useState(0);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const latestDataRef = useRef<OHLCVData[]>([]);
  const isFirstLoadRef = useRef(true);
  const prevPriceRef = useRef<number | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastRenderedSymbolRef = useRef<string>('');

  // Load watchlist on mount
  useEffect(() => {
    getWatchlist().then(setSymbols).catch(() => {});
  }, []);

  /* ── Chart initialization ─────────────────────────────────────────── */
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const initialWidth = container.clientWidth || 800;
    const initialHeight = Math.max(container.clientHeight || 0, 520);
    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.textMuted,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      },
      grid: {
        vertLines: { color: COLORS.gridLine },
        horzLines: { color: COLORS.gridLine },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: COLORS.crosshair,
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: COLORS.crosshair,
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: COLORS.borderColor,
        scaleMargins: { top: 0.08, bottom: 0.22 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: COLORS.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 9,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // ─── Candlestick series (v5 API) ──────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.bullCandle,
      downColor: COLORS.bearCandle,
      borderVisible: false,
      wickUpColor: COLORS.bullCandle,
      wickDownColor: COLORS.bearCandle,
    });

    // ─── Volume histogram (bottom overlay) ─────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // ─── SMA 20 overlay ───────────────────────────────────────────
    const smaSeries = chart.addSeries(LineSeries, {
      color: COLORS.sma20,
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // ─── EMA 50 overlay ───────────────────────────────────────────
    const emaSeries = chart.addSeries(LineSeries, {
      color: COLORS.ema50,
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // ─── Crosshair hover → update legend ──────────────────────────
    chart.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.seriesData) {
        const data = latestDataRef.current;
        if (data.length > 0) {
          const last = data[data.length - 1];
          const prev = data.length > 1 ? data[data.length - 2] : last;
          setLegend({
            open: last.open, high: last.high, low: last.low, close: last.close,
            volume: last.volume,
            change: last.close - prev.close,
            changePct: ((last.close - prev.close) / prev.close) * 100,
          });
        }
        return;
      }
      const candle = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const smaVal = param.seriesData.get(smaSeries) as { value: number } | undefined;
      const emaVal = param.seriesData.get(emaSeries) as { value: number } | undefined;
      if (candle) {
        setLegend({
          open: candle.open, high: candle.high, low: candle.low, close: candle.close,
          volume: 0,
          change: candle.close - candle.open,
          changePct: ((candle.close - candle.open) / candle.open) * 100,
          sma20: smaVal?.value,
          ema50: emaVal?.value,
        });
      }
    });

    // ─── Resize observer for responsive container ─────────────────
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0) {
          chart.applyOptions({ width, height: Math.max(height, 520) });
        }
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;
    priceLineRef.current = null;

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      priceLineRef.current = null;
    };
  }, []);

  /* ── Fetch & render candle data (supports incremental real-time update) ─ */
  const loadCandleData = useCallback(async (symbol: string, timeframe: string, isInitial: boolean = false) => {
    if (isInitial) setLoading(true);

    try {
      const res = await getCandles(symbol, timeframe);
      // Guard against race conditions if user switched symbols while fetching
      if (symbol !== selectedRef.current) return;

      const rawCandles = Array.isArray(res) ? res : (Array.isArray(res?.candles) ? res.candles : []);
      if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
        if (isInitial || symbol !== lastRenderedSymbolRef.current) setDataSource('offline');
        return;
      }

      setDataSource('live');
      setLastUpdated(new Date());

      // Parse & deduplicate
      const parsed: OHLCVData[] = [];
      const seenTimes = new Set<number>();

      for (const c of rawCandles) {
        const t = Math.floor(new Date(c.timestamp).getTime() / 1000);
        const open = parseFloat(Number(c.open).toFixed(2));
        const high = parseFloat(Number(c.high).toFixed(2));
        const low = parseFloat(Number(c.low).toFixed(2));
        const close = parseFloat(Number(c.close).toFixed(2));
        const volume = Math.round(Number(c.volume || 0));

        if (!isNaN(t) && open > 0 && close > 0 && !seenTimes.has(t)) {
          seenTimes.add(t);
          parsed.push({ time: t as Time, open, high, low, close, volume });
        }
      }

      parsed.sort((a, b) => (a.time as number) - (b.time as number));
      if (parsed.length === 0) {
        if (isInitial || symbol !== lastRenderedSymbolRef.current) setDataSource('offline');
        return;
      }

      setBarCount(parsed.length);

      // Technical indicators
      const smaData: Array<{ time: Time; value: number }> = [];
      const emaData: Array<{ time: Time; value: number }> = [];
      let emaAccum = 0;

      for (let i = 0; i < parsed.length; i++) {
        if (i >= 19) {
          let sum = 0;
          for (let j = i - 19; j <= i; j++) sum += parsed[j].close;
          smaData.push({ time: parsed[i].time, value: parseFloat((sum / 20).toFixed(2)) });
        }
        if (i < 49) {
          emaAccum += parsed[i].close;
        } else if (i === 49) {
          emaAccum += parsed[i].close;
          const seed = emaAccum / 50;
          emaData.push({ time: parsed[i].time, value: parseFloat(seed.toFixed(2)) });
        } else {
          const k = 2 / 51;
          const prev = emaData[emaData.length - 1].value;
          const val = parsed[i].close * k + prev * (1 - k);
          emaData.push({ time: parsed[i].time, value: parseFloat(val.toFixed(2)) });
        }
      }

      const last = parsed[parsed.length - 1];
      const prev = parsed.length > 1 ? parsed[parsed.length - 2] : last;

      // Integrate live tick LTP from backend quote metadata into active candle
      const liveLtp = (res && typeof res.ltp === 'number' && res.ltp > 0) ? res.ltp : last.close;
      last.close = liveLtp;
      if (liveLtp > last.high) last.high = liveLtp;
      if (liveLtp < last.low) last.low = liveLtp;

      // Price tick flash indicator
      if (prevPriceRef.current !== null && prevPriceRef.current !== liveLtp) {
        const dir = liveLtp > prevPriceRef.current ? 'up' : 'down';
        setPriceFlash(dir);
        setTimeout(() => setPriceFlash(null), 800);
      }
      prevPriceRef.current = liveLtp;

      const candleSeries = candleSeriesRef.current;
      const volumeSeries = volumeSeriesRef.current;
      const smaSeries = smaSeriesRef.current;
      const emaSeries = emaSeriesRef.current;

      if (!candleSeries || !volumeSeries) return;

      const isSymbolChange = symbol !== lastRenderedSymbolRef.current;

      // ── INCREMENTAL VS FULL UPDATE ───────────────────────────────
      if (isInitial || isFirstLoadRef.current || isSymbolChange) {
        // Full chart initialization for new symbol or timeframe
        candleSeries.setData(parsed.map(c => ({
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
        })));

        volumeSeries.setData(parsed.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? COLORS.bullVolume : COLORS.bearVolume,
        })));

        if (smaSeries) smaSeries.setData(smaData);
        if (emaSeries) emaSeries.setData(emaData);

        // Price line
        if (!priceLineRef.current) {
          priceLineRef.current = candleSeries.createPriceLine({
            price: liveLtp,
            color: COLORS.priceLine,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'LTP',
          });
        } else {
          priceLineRef.current.applyOptions({ price: liveLtp });
        }

        // Fit content on initial load / symbol switch
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
        isFirstLoadRef.current = false;
        lastRenderedSymbolRef.current = symbol;
      } else {
        // High-frequency real-time tick update (smooth, zero jitter, preserves user zoom)
        candleSeries.update({
          time: last.time, open: last.open, high: last.high, low: last.low, close: last.close,
        });

        volumeSeries.update({
          time: last.time,
          value: last.volume,
          color: last.close >= last.open ? COLORS.bullVolume : COLORS.bearVolume,
        });

        if (smaSeries && smaData.length > 0) {
          smaSeries.update(smaData[smaData.length - 1]);
        }
        if (emaSeries && emaData.length > 0) {
          emaSeries.update(emaData[emaData.length - 1]);
        }

        // Update price line position
        if (priceLineRef.current) {
          priceLineRef.current.applyOptions({ price: liveLtp });
        }
      }

      latestDataRef.current = parsed;

      // Header day change calculation
      const dayChange = (res && typeof res.change === 'number' && res.change !== 0)
        ? res.change
        : (liveLtp - prev.close);
      const dayChangePct = (res && typeof res.changePct === 'number' && res.changePct !== 0)
        ? res.changePct
        : (prev.close > 0 ? (((liveLtp - prev.close) / prev.close) * 100) : 0);

      // Update header legend
      setLegend({
        open: last.open, high: last.high, low: last.low, close: liveLtp,
        volume: last.volume,
        change: dayChange,
        changePct: dayChangePct,
        sma20: smaData.length > 0 ? smaData[smaData.length - 1].value : undefined,
        ema50: emaData.length > 0 ? emaData[emaData.length - 1].value : undefined,
      });

    } catch (err) {
      console.warn('[Watchlist] Error updating candles:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  /* ── Effect: Symbol/Timeframe switch & High-Frequency Auto-Refresh ──── */
  useEffect(() => {
    isFirstLoadRef.current = true;
    prevPriceRef.current = null;
    loadCandleData(selected, activeTimeframe, true);

    // High-frequency refresh: 2.5s for intraday, 10s for daily
    const isIntraday = ['1m', '5m', '15m', '1h'].includes(activeTimeframe);
    const pollMs = isIntraday ? 2500 : 10000;

    const interval = setInterval(() => {
      loadCandleData(selected, activeTimeframe, false);
    }, pollMs);

    return () => clearInterval(interval);
  }, [selected, activeTimeframe, loadCandleData]);

  /* ── Search handler ────────────────────────────────────────────────── */
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;
    setSearchError(null);
    setSearching(true);
    try {
      const res = await getCandles(query, activeTimeframe);
      if (Array.isArray(res.candles) && res.candles.length > 0) {
        if (!symbols.some(s => s.ticker === query)) {
          setSymbols(prev => [...prev, { ticker: query, exchange: 'NSE' }]);
        }
        setSelected(query);
        setLegend(null);
        setBarCount(0);
        setDataSource('loading');
        setSearchQuery('');
      } else {
        setSearchError(`Symbol ${query} not found. Try WIPRO, SBIN, TCS, AAPL`);
      }
    } catch {
      setSearchError('Failed to fetch data. Verify ticker symbol.');
    } finally {
      setSearching(false);
    }
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const changeColor = legend ? (legend.change >= 0 ? COLORS.bullCandle : COLORS.bearCandle) : COLORS.textMuted;
  const changeSign = legend && legend.change >= 0 ? '+' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 82px)' }}>

      {/* ── Top toolbar (broker-style) ─────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0', borderBottom: `1px solid ${COLORS.borderColor}`,
        flexWrap: 'wrap',
      }}>
        {/* Symbol name + price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginRight: 8 }}>
          <span style={{
            fontSize: 18, fontWeight: 700, color: '#fff',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {selected}
          </span>
          {legend && (
            <>
              <span style={{
                fontSize: 20, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: priceFlash === 'up' ? COLORS.bullCandle : priceFlash === 'down' ? COLORS.bearCandle : '#fff',
                transition: 'color 0.3s ease',
              }}>
                {legend.close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 600, color: changeColor,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {changeSign}{legend.change.toFixed(2)} ({changeSign}{legend.changePct.toFixed(2)}%)
              </span>

              {/* High-frequency Live indicator */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                padding: '3px 8px', borderRadius: 4,
                marginLeft: 6,
                background: dataSource === 'live'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(245, 158, 11, 0.12)',
                color: dataSource === 'live' ? '#34d399' : '#fbbf24',
                border: `1px solid ${dataSource === 'live'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(245, 158, 11, 0.3)'}`,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'currentColor',
                  boxShadow: `0 0 6px currentColor`,
                  animation: dataSource === 'live' ? 'pulseDot 1.2s infinite' : 'none',
                }} />
                {dataSource === 'live' ? 'LIVE 2.5s' : dataSource === 'loading' ? 'CONNECTING' : 'OFFLINE'}
              </span>

              {barCount > 0 && (
                <span style={{
                  fontSize: 10, color: COLORS.textMuted, marginLeft: 4,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {barCount} bars
                </span>
              )}
            </>
          )}
        </div>

        {/* Timeframe buttons */}
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)',
          padding: 3, borderRadius: 6, border: `1px solid ${COLORS.borderColor}`,
          marginLeft: 'auto',
        }}>
          {TIMEFRAMES.map(tf => {
            const active = activeTimeframe === tf.value;
            return (
              <button
                key={tf.value}
                onClick={() => setActiveTimeframe(tf.value)}
                style={{
                  padding: '5px 12px', borderRadius: 4, fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: active ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                  color: active ? '#c7d2fe' : COLORS.textMuted,
                  border: active ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              disabled={searching}
              style={{
                padding: '6px 12px 6px 30px', borderRadius: 6,
                border: `1px solid ${COLORS.borderColor}`,
                background: 'rgba(255,255,255,0.03)', color: '#fff',
                width: 160, fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <IconSearch size={13} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              opacity: 0.4,
            } as any} />
          </div>
          <button type="submit" disabled={searching} style={{
            padding: '6px 14px', fontSize: 11, borderRadius: 6,
            boxShadow: 'none',
          }}>
            {searching ? '...' : 'Go'}
          </button>
        </form>
      </div>

      {searchError && (
        <div style={{
          color: COLORS.bearCandle, background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          padding: '8px 14px', borderRadius: 6, margin: '8px 0', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <IconAlertTriangle size={13} color={COLORS.bearCandle} />
          {searchError}
        </div>
      )}

      {/* ── Symbol tabs (watchlist strip) ──────────────────────────── */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 0',
        borderBottom: `1px solid ${COLORS.borderColor}`,
        overflowX: 'auto', flexShrink: 0,
      }}>
        {symbols.map(s => {
          const isActive = selected === s.ticker;
          return (
            <button
              key={s.ticker}
              onClick={() => {
                if (selected !== s.ticker) {
                  setSelected(s.ticker);
                  setLegend(null);
                  setBarCount(0);
                  setDataSource('loading');
                  candleSeriesRef.current?.setData([]);
                  volumeSeriesRef.current?.setData([]);
                  smaSeriesRef.current?.setData([]);
                  emaSeriesRef.current?.setData([]);
                }
              }}
              style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 11,
                fontWeight: isActive ? 700 : 500,
                fontFamily: "'JetBrains Mono', monospace",
                background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                color: isActive ? '#e0e7ff' : COLORS.textMuted,
                border: isActive
                  ? '1px solid rgba(99, 102, 241, 0.35)'
                  : '1px solid transparent',
                boxShadow: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {s.ticker}
            </button>
          );
        })}
      </div>

      {/* ── Chart area (fills remaining height) ───────────────────── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 520, height: '100%' }}>
        {/* OHLCV legend overlay (top-left on chart, like TradingView) */}
        {legend && (
          <div style={{
            position: 'absolute', top: 10, left: 12, zIndex: 10,
            display: 'flex', gap: 14, fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: COLORS.textMuted,
            pointerEvents: 'none',
            flexWrap: 'wrap',
          }}>
            <span>O <b style={{ color: COLORS.textPrimary }}>{legend.open.toFixed(2)}</b></span>
            <span>H <b style={{ color: COLORS.bullCandle }}>{legend.high.toFixed(2)}</b></span>
            <span>L <b style={{ color: COLORS.bearCandle }}>{legend.low.toFixed(2)}</b></span>
            <span>C <b style={{ color: changeColor }}>{legend.close.toFixed(2)}</b></span>
            {legend.volume > 0 && (
              <span>Vol <b style={{ color: COLORS.textPrimary }}>{legend.volume.toLocaleString()}</b></span>
            )}
            {legend.sma20 !== undefined && (
              <span style={{ color: COLORS.sma20 }}>SMA20 <b>{legend.sma20.toFixed(2)}</b></span>
            )}
            {legend.ema50 !== undefined && (
              <span style={{ color: COLORS.ema50 }}>EMA50 <b>{legend.ema50.toFixed(2)}</b></span>
            )}
            {lastUpdated && (
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', zIndex: 20,
            color: COLORS.textMuted, fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Loading {selected}...
          </div>
        )}

        {/* The chart canvas container */}
        <div
          ref={chartContainerRef}
          style={{
            width: '100%',
            height: '100%',
            minHeight: 520,
            borderRadius: 0,
            background: COLORS.bg,
          }}
        />
      </div>
    </div>
  );
}
