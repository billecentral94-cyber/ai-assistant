const WATCHLIST = [
  { ticker: 'NIFTY 50', exchange: 'NSE' },
  { ticker: 'BANKNIFTY', exchange: 'NSE' },
  { ticker: 'RELIANCE', exchange: 'NSE' },
  { ticker: 'TCS', exchange: 'NSE' },
  { ticker: 'INFY', exchange: 'NSE' },
  { ticker: 'HDFCBANK', exchange: 'NSE' },
  { ticker: 'ICICIBANK', exchange: 'NSE' },
  { ticker: 'SBIN', exchange: 'NSE' },
  { ticker: 'BAJFINANCE', exchange: 'NSE' },
  { ticker: 'MOREPENLAB', exchange: 'NSE' },
];

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ watchlist: WATCHLIST });
};
