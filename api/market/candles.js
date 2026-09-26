const https = require('https');

const YAHOO_MAP = {
  RELIANCE: 'RELIANCE.NS',
  TCS: 'TCS.NS',
  INFY: 'INFY.NS',
  HDFCBANK: 'HDFCBANK.NS',
  ICICIBANK: 'ICICIBANK.NS',
  'NIFTY 50': '^NSEI',
  NIFTY: '^NSEI',
  NIFTY50: '^NSEI',
  BANKNIFTY: '^NSEBANK',
  'BANK NIFTY': '^NSEBANK',
  WIPRO: 'WIPRO.NS',
  KOTAKBANK: 'KOTAKBANK.NS',
  AXISBANK: 'AXISBANK.NS',
  SBIN: 'SBIN.NS',
  BAJFINANCE: 'BAJFINANCE.NS',
  MARUTI: 'MARUTI.NS',
  CUPID: 'CUPID.NS',
  TATAMOTORS: 'TATAMOTORS.NS',
  LT: 'LT.NS',
  BHARTIARTL: 'BHARTIARTL.NS',
  ITC: 'ITC.NS',
  HINDUNILVR: 'HINDUNILVR.NS',
  AAPL: 'AAPL',
  TSLA: 'TSLA',
  GOOGL: 'GOOGL',
  MSFT: 'MSFT',
  AMZN: 'AMZN',
};

module.exports = async function handler(req, res) {
  // CORS & Cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const symbol = String(req.query.symbol || 'RELIANCE').toUpperCase().replace(/\+/g, ' ').trim();
  const period = String(req.query.period || '5d');
  const interval = String(req.query.interval || '1m');

  const yhTicker = YAHOO_MAP[symbol] || (symbol.includes('.') || symbol.startsWith('^') ? symbol : `${symbol}.NS`);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=${interval}&range=${period}`;

  return new Promise((resolve) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        timeout: 6000,
      },
      (yahooRes) => {
        let raw = '';
        yahooRes.on('data', (chunk) => (raw += chunk));
        yahooRes.on('end', () => {
          try {
            const data = JSON.parse(raw);
            const result = data?.chart?.result?.[0];
            if (!result || !result.timestamp) {
              res.status(200).json({ symbol, candles: [], error: 'No data from market provider' });
              return resolve();
            }

            const ts = result.timestamp;
            const quote = result.indicators?.quote?.[0] || {};
            const opens = quote.open || [];
            const highs = quote.high || [];
            const lows = quote.low || [];
            const closes = quote.close || [];
            const volumes = quote.volume || [];

            const LIMIT = { '1m': 150, '5m': 250, '15m': 250, '60m': 350, '1h': 350, '1d': 2500, '1wk': 1500, '1mo': 600 };
            const limit = LIMIT[interval] || 2500;

            const candles = ts
              .map((t, i) => ({
                timestamp: new Date(t * 1000).toISOString(),
                open: parseFloat((opens[i] ?? 0).toFixed(2)),
                high: parseFloat((highs[i] ?? 0).toFixed(2)),
                low: parseFloat((lows[i] ?? 0).toFixed(2)),
                close: parseFloat((closes[i] ?? 0).toFixed(2)),
                volume: Math.round(volumes[i] ?? 0),
              }))
              .filter((c) => c.open > 0 && c.close > 0)
              .slice(-limit);

            const meta = result.meta || {};
            const ltp = meta.regularMarketPrice || (candles.length > 0 ? candles[candles.length - 1].close : 0);

            res.status(200).json({
              symbol,
              ltp,
              previousClose: meta.previousClose || meta.chartPreviousClose || 0,
              change: meta.fulldayChange || 0,
              changePct: meta.regularMarketChangePercent || 0,
              candles,
            });
            resolve();
          } catch (e) {
            res.status(200).json({ symbol, candles: [], error: e.message });
            resolve();
          }
        });
      }
    );

    request.on('error', (err) => {
      res.status(200).json({ symbol, candles: [], error: err.message });
      resolve();
    });

    request.on('timeout', () => {
      request.destroy();
      res.status(200).json({ symbol, candles: [], error: 'Timeout fetching from market provider' });
      resolve();
    });
  });
};
