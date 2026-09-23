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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const symbol = String(req.query.symbol || 'RELIANCE').toUpperCase().trim();
  const yhTicker = YAHOO_MAP[symbol] || (symbol.includes('.') || symbol.startsWith('^') ? symbol : `${symbol}.NS`);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=1m&range=1d`;

  return new Promise((resolve) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        timeout: 4000,
      },
      (yahooRes) => {
        let raw = '';
        yahooRes.on('data', (chunk) => (raw += chunk));
        yahooRes.on('end', () => {
          try {
            const data = JSON.parse(raw);
            const meta = data?.chart?.result?.[0]?.meta || {};
            const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0] || {};
            const closes = (quote.close || []).filter((v) => v != null);
            const ltp = meta.regularMarketPrice || (closes.length > 0 ? closes[closes.length - 1] : 0);
            const prevClose = meta.previousClose || meta.chartPreviousClose || ltp;
            const change = ltp - prevClose;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

            res.status(200).json({
              symbol,
              ltp: parseFloat(Number(ltp).toFixed(2)),
              high: parseFloat(Number(meta.regularMarketDayHigh || ltp).toFixed(2)),
              low: parseFloat(Number(meta.regularMarketDayLow || ltp).toFixed(2)),
              previousClose: parseFloat(Number(prevClose).toFixed(2)),
              change: parseFloat(Number(change).toFixed(2)),
              changePct: parseFloat(Number(changePct).toFixed(2)),
              volume: meta.regularMarketVolume || 0,
              timestamp: meta.regularMarketTime
                ? new Date(meta.regularMarketTime * 1000).toISOString()
                : new Date().toISOString(),
            });
            resolve();
          } catch (e) {
            res.status(200).json({ symbol, error: e.message });
            resolve();
          }
        });
      }
    );

    request.on('error', (err) => {
      res.status(200).json({ symbol, error: err.message });
      resolve();
    });

    request.on('timeout', () => {
      request.destroy();
      res.status(200).json({ symbol, error: 'timeout' });
      resolve();
    });
  });
};
