const crypto = require('crypto');
const https = require('https');

// ── Base32 & TOTP Generator ──────────────────────────────────────────────────
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = alphabet.indexOf(cleaned[i]);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret) {
  try {
    const key = base32Decode(secret.trim());
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / 30);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeStep));
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1] & 0xf;
    const code =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return (code % 1000000).toString().padStart(6, '0');
  } catch {
    return '000000';
  }
}

function reqPromise(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: e.message, raw: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    if (body) req.write(body);
    req.end();
  });
}

// ── In-Memory Token & Holdings Cache ─────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = 0;
let _cachedPortfolio = null;
let _cacheExpiry = 0;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const isSync = req.query.sync === 'true';

  // Return fresh cache if not expired and not explicit sync
  if (!isSync && _cachedPortfolio && Date.now() < _cacheExpiry) {
    return res.status(200).json(_cachedPortfolio);
  }

  const clientcode = (process.env.SMARTAPI_CLIENT_ID || 'AACI406579').trim();
  const apiKey = (process.env.SMARTAPI_API_KEY || 'BH2HutuS').trim();
  const pin = (process.env.SMARTAPI_PIN || process.env.SMARTAPI_PASSWORD || '1819').trim();
  const totpSecret = (process.env.SMARTAPI_TOTP_SECRET || '2G62ZZ7LNVIETPDS6HMQSNG5VM').trim();

  try {
    // 1. Get or renew JWT token
    let jwt = _cachedToken;
    if (!jwt || Date.now() >= _tokenExpiry) {
      const totp = generateTOTP(totpSecret);
      const loginBody = JSON.stringify({ clientcode, password: pin, totp });

      const loginRes = await reqPromise({
        hostname: 'apiconnect.angelone.in',
        path: '/rest/auth/angelbroking/user/v1/loginByPassword',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientIP': '127.0.0.1',
          'X-MACAddress': '00-00-00-00-00-00',
          'X-PrivateKey': apiKey,
          'api_key': apiKey,
          'Content-Length': Buffer.byteLength(loginBody),
        }
      }, loginBody);

      if (loginRes?.data?.jwtToken) {
        jwt = loginRes.data.jwtToken;
        _cachedToken = jwt;
        _tokenExpiry = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      } else {
        throw new Error('SmartAPI Login failed: ' + (loginRes?.message || JSON.stringify(loginRes)));
      }
    }

    // 2. Fetch Holdings & RMS Funds
    const authHeaders = {
      'Authorization': 'Bearer ' + jwt,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientIP': '127.0.0.1',
      'X-MACAddress': '00-00-00-00-00-00',
      'X-PrivateKey': apiKey,
      'api_key': apiKey,
    };

    const [holdingsRes, rmsRes] = await Promise.all([
      reqPromise({ hostname: 'apiconnect.angelone.in', path: '/rest/secure/angelbroking/portfolio/v1/getHolding', method: 'GET', headers: authHeaders }),
      reqPromise({ hostname: 'apiconnect.angelone.in', path: '/rest/secure/angelbroking/user/v1/getRMS', method: 'GET', headers: authHeaders })
    ]);

    const rawHoldings = Array.isArray(holdingsRes?.data) ? holdingsRes.data : [];
    const cash = parseFloat(rmsRes?.data?.net || '0');

    // Sector mapping helper
    const SECTOR_MAP = {
      MOREPENLAB: 'Pharmaceuticals & Healthcare',
      RELIANCE: 'Energy & Petrochemicals',
      TCS: 'Information Technology',
      INFY: 'Information Technology',
      HDFCBANK: 'Banking & Financials',
      ICICIBANK: 'Banking & Financials',
      SBIN: 'Banking & Financials',
      BAJFINANCE: 'Financial Services',
    };

    const holdings = rawHoldings.map(h => {
      const sym = (h.tradingsymbol || 'UNKNOWN').replace('-EQ', '').trim();
      const qty = parseInt(h.quantity || h.realisedquantity || '0', 10);
      const avgPrice = parseFloat(Number(h.averageprice || '0').toFixed(2));
      const ltp = parseFloat(Number(h.ltp || h.close || avgPrice).toFixed(2));
      const currentValue = parseFloat((qty * ltp).toFixed(2));
      const cost = parseFloat((qty * avgPrice).toFixed(2));
      const pnl = parseFloat((h.profitandloss ?? (currentValue - cost)).toFixed(2));
      const pnlPct = cost > 0 ? parseFloat(((pnl / cost) * 100).toFixed(2)) : 0;
      return {
        symbol: sym,
        sector: SECTOR_MAP[sym] || 'Diversified Equity',
        qty,
        avgPrice,
        ltp,
        currentValue,
        cost,
        pnl,
        pnlPct,
        source: 'Angel One Demat',
        isin: h.isin || '',
      };
    }).filter(h => h.qty > 0);

    const totalHoldingValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
    const totalPnL = holdings.reduce((s, h) => s + h.pnl, 0);
    const totalPnLPct = totalCost > 0 ? parseFloat(((totalPnL / totalCost) * 100).toFixed(2)) : 0;
    const totalValue = parseFloat((totalHoldingValue + cash).toFixed(2));

    const result = {
      connected: true,
      broker: 'Angel One (SmartAPI Live Demat)',
      account: clientcode,
      totalValue,
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalPnL: parseFloat(totalPnL.toFixed(2)),
      totalPnLPct,
      dayChange: totalPnLPct,
      availableFunds: parseFloat(cash.toFixed(2)),
      holdings,
      paperTrades: 0,
      timestamp: new Date().toISOString()
    };

    _cachedPortfolio = result;
    _cacheExpiry = Date.now() + 60 * 1000; // Cache 60 seconds

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Portfolio Serverless Error]:', err.message);
    if (_cachedPortfolio) {
      return res.status(200).json(_cachedPortfolio);
    }
    return res.status(500).json({
      connected: false,
      error: err.message,
      broker: 'Angel One',
      totalValue: 0,
      totalCost: 0,
      totalPnL: 0,
      totalPnLPct: 0,
      dayChange: 0,
      holdings: [],
      availableFunds: 0,
      paperTrades: 0
    });
  }
}
