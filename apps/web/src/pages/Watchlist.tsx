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
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '1D', value: '1D' },
  { label: '5Y', value: '5Y' },
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
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

export type DrawingTool = 'cursor' | 'breakout' | 'support' | 'resistance' | 'trendline' | 'box';

export interface CustomPriceLine {
  id: string;
  price: number;
  label: string;
  color: string;
  lineRef: IPriceLine;
}

export interface Trendline {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface BreakoutBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

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

  // Sketching & Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [priceLines, setPriceLines] = useState<CustomPriceLine[]>([]);
  const [trendlines, setTrendlines] = useState<Trendline[]>([]);
  const [boxes, setBoxes] = useState<BreakoutBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [currentPreview, setCurrentPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const activeToolRef = useRef<DrawingTool>('cursor');
  activeToolRef.current = activeTool;
  const userPriceLinesRef = useRef<CustomPriceLine[]>([]);

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

  // ESC key cancels active drawing mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool('cursor');
        setIsDrawing(false);
        setDrawingStart(null);
        setCurrentPreview(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

    // ─── Click listener for Breakout / Support / Resistance Price Lines ───
    chart.subscribeClick(param => {
      const tool = activeToolRef.current;
      if (!param || !param.point || !candleSeriesRef.current) return;
      if (['breakout', 'support', 'resistance'].includes(tool)) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price && !isNaN(price)) {
          let color = '#10b981';
          let label = 'BREAKOUT';
          if (tool === 'support') {
            color = '#ef4444';
            label = 'SUPPORT';
          } else if (tool === 'resistance') {
            color = '#f59e0b';
            label = 'RESISTANCE';
          }
          const line = candleSeriesRef.current.createPriceLine({
            price,
            color,
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `${label} ${price.toFixed(2)}`,
          });
          const item: CustomPriceLine = {
            id: 'PL-' + Date.now(),
            price,
            label,
            color,
            lineRef: line,
          };
          userPriceLinesRef.current.push(item);
          setPriceLines([...userPriceLinesRef.current]);
          setActiveTool('cursor');
        }
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

  /* ── Sketching & Drawing Handlers ──────────────────────────────────── */
  const handleClearAll = () => {
    userPriceLinesRef.current.forEach(p => {
      try { candleSeriesRef.current?.removePriceLine(p.lineRef); } catch {}
    });
    userPriceLinesRef.current = [];
    setPriceLines([]);
    setTrendlines([]);
    setBoxes([]);
    setActiveTool('cursor');
  };

  const handleUndo = () => {
    if (boxes.length > 0) {
      setBoxes(prev => prev.slice(0, -1));
    } else if (trendlines.length > 0) {
      setTrendlines(prev => prev.slice(0, -1));
    } else if (userPriceLinesRef.current.length > 0) {
      const last = userPriceLinesRef.current.pop();
      if (last) {
        try { candleSeriesRef.current?.removePriceLine(last.lineRef); } catch {}
        setPriceLines([...userPriceLinesRef.current]);
      }
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'trendline' && activeTool !== 'box') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setDrawingStart({ x, y });
    setCurrentPreview({ x1: x, y1: y, x2: x, y2: y });
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !drawingStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPreview({ x1: drawingStart.x, y1: drawingStart.y, x2: x, y2: y });
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !drawingStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dist = Math.hypot(x - drawingStart.x, y - drawingStart.y);

    if (dist > 5) {
      if (activeTool === 'trendline') {
        const newLine: Trendline = {
          id: 'TL-' + Date.now(),
          x1: drawingStart.x,
          y1: drawingStart.y,
          x2: x,
          y2: y,
          color: '#38bdf8',
        };
        setTrendlines(prev => [...prev, newLine]);
      } else if (activeTool === 'box') {
        const newBox: BreakoutBox = {
          id: 'BOX-' + Date.now(),
          x: Math.min(drawingStart.x, x),
          y: Math.min(drawingStart.y, y),
          width: Math.abs(x - drawingStart.x),
          height: Math.abs(y - drawingStart.y),
          color: 'rgba(16, 185, 129, 0.18)',
        };
        setBoxes(prev => [...prev, newBox]);
      }
    }

    setIsDrawing(false);
    setDrawingStart(null);
    setCurrentPreview(null);
  };

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
                  userPriceLinesRef.current.forEach(p => {
                    try { candleSeriesRef.current?.removePriceLine(p.lineRef); } catch {}
                  });
                  userPriceLinesRef.current = [];
                  setPriceLines([]);
                  setTrendlines([]);
                  setBoxes([]);
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

      {/* ── Main Chart Layout with Left Drawing Toolbar ──────────── */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', minHeight: 520, height: '100%', overflow: 'hidden' }}>

        {/* ── TradingView-Style Left Sketching Toolbar ───────────────── */}
        <div style={{
          width: 44,
          background: '#080a10',
          borderRight: `1px solid ${COLORS.borderColor}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: 6,
          zIndex: 25,
          flexShrink: 0,
        }}>
          {/* Cursor / Navigation */}
          <button
            title="Cursor / Pan Mode (ESC)"
            onClick={() => setActiveTool('cursor')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: activeTool === 'cursor' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              border: activeTool === 'cursor' ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent',
              color: activeTool === 'cursor' ? '#818cf8' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 3 10 20 13 13 20 10 3 3" />
            </svg>
          </button>

          {/* Breakout Line Tool */}
          <button
            title="Breakout Line — Click on chart to drop Breakout price level"
            onClick={() => setActiveTool(activeTool === 'breakout' ? 'cursor' : 'breakout')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: activeTool === 'breakout' ? 'rgba(16, 185, 129, 0.22)' : 'transparent',
              border: activeTool === 'breakout' ? '1px solid #10b981' : '1px solid transparent',
              color: activeTool === 'breakout' ? '#10b981' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="12" x2="22" y2="12" />
              <polyline points="16 6 22 12 16 18" />
            </svg>
          </button>

          {/* Support Line Tool */}
          <button
            title="Support Line — Click on chart to drop Support level"
            onClick={() => setActiveTool(activeTool === 'support' ? 'cursor' : 'support')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: activeTool === 'support' ? 'rgba(239, 68, 68, 0.22)' : 'transparent',
              border: activeTool === 'support' ? '1px solid #ef4444' : '1px solid transparent',
              color: activeTool === 'support' ? '#ef4444' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="18" x2="22" y2="18" />
              <polyline points="18 12 12 18 6 12" />
            </svg>
          </button>

          {/* Resistance Line Tool */}
          <button
            title="Resistance Line — Click on chart to drop Resistance level"
            onClick={() => setActiveTool(activeTool === 'resistance' ? 'cursor' : 'resistance')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: activeTool === 'resistance' ? 'rgba(245, 158, 11, 0.22)' : 'transparent',
              border: activeTool === 'resistance' ? '1px solid #f59e0b' : '1px solid transparent',
              color: activeTool === 'resistance' ? '#f59e0b' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="6" x2="22" y2="6" />
              <polyline points="6 12 12 6 18 12" />
            </svg>
          </button>

          {/* Trendline Tool */}
          <button
            title="Trendline — Drag on chart to draw diagonal trendline"
            onClick={() => setActiveTool(activeTool === 'trendline' ? 'cursor' : 'trendline')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: activeTool === 'trendline' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              border: activeTool === 'trendline' ? '1px solid #38bdf8' : '1px solid transparent',
              color: activeTool === 'trendline' ? '#38bdf8' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="20" x2="20" y2="4" />
              <circle cx="4" cy="20" r="2" fill="currentColor" />
              <circle cx="20" cy="4" r="2" fill="currentColor" />
            </svg>
          </button>

          {/* Breakout Box / Zone Tool */}
          <button
            title="Breakout Box — Drag on chart to highlight consolidation zone"
            onClick={() => setActiveTool(activeTool === 'box' ? 'cursor' : 'box')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: activeTool === 'box' ? 'rgba(168, 85, 247, 0.22)' : 'transparent',
              border: activeTool === 'box' ? '1px solid #a855f7' : '1px solid transparent',
              color: activeTool === 'box' ? '#a855f7' : COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 3" />
            </svg>
          </button>

          <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

          {/* Undo */}
          <button
            title="Undo last line/drawing"
            onClick={handleUndo}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'transparent', border: '1px solid transparent',
              color: COLORS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>

          {/* Clear All */}
          <button
            title="Clear all breakout lines & drawings"
            onClick={handleClearAll}
            style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'transparent', border: '1px solid transparent',
              color: COLORS.bearCandle,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        {/* ── Chart Viewport & Drawing Layer ────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', height: '100%', width: '100%', minHeight: 520, overflow: 'hidden' }}>

          {/* Active Tool Status Banner */}
          {activeTool !== 'cursor' && (
            <div style={{
              position: 'absolute', top: 12, right: 16, zIndex: 30,
              background: 'rgba(10, 14, 23, 0.92)',
              border: `1px solid ${
                activeTool === 'breakout' ? '#10b981' : activeTool === 'support' ? '#ef4444' : activeTool === 'resistance' ? '#f59e0b' : '#38bdf8'
              }`,
              borderRadius: 6, padding: '6px 14px',
              fontSize: 11, color: '#f1f5f9',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: activeTool === 'breakout' ? '#10b981' : activeTool === 'support' ? '#ef4444' : activeTool === 'resistance' ? '#f59e0b' : '#38bdf8',
                boxShadow: '0 0 8px currentColor',
              }} />
              <span>
                <b>{activeTool.toUpperCase()} MODE:</b> {
                  ['breakout', 'support', 'resistance'].includes(activeTool)
                    ? 'Click anywhere on chart to drop price line'
                    : 'Click & drag across chart to sketch'
                } <span style={{ opacity: 0.6 }}>(Press ESC to cancel)</span>
              </span>
              <button
                onClick={() => setActiveTool('cursor')}
                style={{
                  background: 'transparent', border: 'none', color: '#94a3b8',
                  cursor: 'pointer', padding: '0 4px', fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>
          )}

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

          {/* ── Interactive SVG Sketching Overlay ─────────────────────── */}
          <svg
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              pointerEvents: (activeTool === 'trendline' || activeTool === 'box') ? 'auto' : 'none',
              cursor: (activeTool === 'trendline' || activeTool === 'box') ? 'crosshair' : 'default',
              zIndex: 15,
            }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
          >
            {/* Persisted Breakout Boxes */}
            {boxes.map(b => (
              <rect
                key={b.id}
                x={b.x} y={b.y} width={b.width} height={b.height}
                fill={b.color}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            ))}

            {/* Persisted Trendlines */}
            {trendlines.map(t => (
              <g key={t.id}>
                <line
                  x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  stroke={t.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx={t.x1} cy={t.y1} r="3" fill={t.color} />
                <circle cx={t.x2} cy={t.y2} r="3" fill={t.color} />
              </g>
            ))}

            {/* Live Drag Preview */}
            {currentPreview && activeTool === 'trendline' && (
              <line
                x1={currentPreview.x1} y1={currentPreview.y1}
                x2={currentPreview.x2} y2={currentPreview.y2}
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            )}

            {currentPreview && activeTool === 'box' && (
              <rect
                x={Math.min(currentPreview.x1, currentPreview.x2)}
                y={Math.min(currentPreview.y1, currentPreview.y2)}
                width={Math.abs(currentPreview.x2 - currentPreview.x1)}
                height={Math.abs(currentPreview.y2 - currentPreview.y1)}
                fill="rgba(16, 185, 129, 0.18)"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}
          </svg>

        </div>
      </div>
    </div>
  );
}
