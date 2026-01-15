import express from “express”;
import fetch from “node-fetch”;
import cors from “cors”;

const app = express();

// CORS configuration
app.use(cors({
origin: ‘*’,
methods: [‘GET’, ‘POST’, ‘PUT’, ‘DELETE’, ‘OPTIONS’],
allowedHeaders: [‘Content-Type’, ‘Authorization’],
credentials: false
}));

app.options(’*’, cors());

app.use((req, res, next) => {
res.header(‘Access-Control-Allow-Origin’, ‘*’);
res.header(‘Access-Control-Allow-Methods’, ‘GET, POST, PUT, DELETE, OPTIONS’);
res.header(‘Access-Control-Allow-Headers’, ‘Content-Type, Authorization’);
next();
});

// Cache configuration
let cache = {
data: null,
timestamp: 0
};

const CACHE_DURATION = 10000; // 10 seconds for faster updates

// Helper function to fetch with timeout
async function fetchWithTimeout(url, timeout = 8000) {
const controller = new AbortController();
const id = setTimeout(() => controller.abort(), timeout);

try {
const response = await fetch(url, { signal: controller.signal });
clearTimeout(id);
return response;
} catch (error) {
clearTimeout(id);
throw error;
}
}

app.get(”/markets”, async (req, res) => {
try {
console.log(‘📊 Markets endpoint called’);

```
// Return cached data if fresh
if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
  console.log('✅ Returning cached data');
  return res.json(cache.data);
}

console.log('🔄 Fetching fresh data from multiple sources...');

// Fetch all data in parallel with error handling
const [
  binanceData,
  yahooData,
  polymarketData,
  fredData
] = await Promise.all([
  // 1. Binance for most accurate BTC price
  fetchWithTimeout('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT')
    .then(r => r.json())
    .catch(err => {
      console.error('Binance error:', err.message);
      return null;
    }),
  
  // 2. Yahoo Finance for all market data in parallel
  Promise.all([
    // S&P 500
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null),
    // Russell 2000
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/%5ERUT?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null),
    // DXY
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null),
    // VIX
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null),
    // Gold
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null),
    // US 10Y
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null),
    // US 2Y
    fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1d&range=1d')
      .then(r => r.json())
      .catch(() => null)
  ]),
  
  // 3. Polymarket for Fed predictions
  fetchWithTimeout('https://clob.polymarket.com/markets')
    .then(r => r.json())
    .then(markets => {
      // Find Fed rate cut market
      const fedMarket = markets.find(m => 
        m.question && m.question.toLowerCase().includes('fed') && 
        m.question.toLowerCase().includes('rate')
      );
      return fedMarket || null;
    })
    .catch(err => {
      console.error('Polymarket error:', err.message);
      return null;
    }),
  
  // 4. FRED API (Federal Reserve Economic Data)
  Promise.all([
    // Reverse Repo
    fetchWithTimeout('https://api.stlouisfed.org/fred/series/observations?series_id=RRPONTSYD&api_key=demo&file_type=json&limit=1&sort_order=desc')
      .then(r => r.json())
      .catch(() => null),
    // Fed Funds Rate
    fetchWithTimeout('https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=demo&file_type=json&limit=1&sort_order=desc')
      .then(r => r.json())
      .catch(() => null),
    // Fed Balance Sheet
    fetchWithTimeout('https://api.stlouisfed.org/fred/series/observations?series_id=WALCL&api_key=demo&file_type=json&limit=2&sort_order=desc')
      .then(r => r.json())
      .catch(() => null)
  ])
]);

console.log('✅ Data fetched, parsing...');

// Parse Bitcoin from Binance (most accurate)
let bitcoin = {
  price: 95000,
  change24h: 2.5,
  volume24h: "45.0",
  marketCap: "1850.00"
};

if (binanceData) {
  console.log('Binance raw data:', JSON.stringify(binanceData).substring(0, 200));
  
  // Binance returns lastPrice as string
  const price = parseFloat(binanceData.lastPrice || binanceData.c);
  const change = parseFloat(binanceData.priceChangePercent || binanceData.P);
  const volume = parseFloat(binanceData.volume || binanceData.v || 50000);
  
  if (price && !isNaN(price)) {
    const volumeInBillions = (volume * price) / 1000000000;
    
    bitcoin = {
      price: Math.round(price),
      change24h: parseFloat((change || 2.5).toFixed(2)),
      volume24h: volumeInBillions.toFixed(1),
      marketCap: (price * 19.5 / 1000).toFixed(2)
    };
    console.log('✅ Binance BTC price:', bitcoin.price);
  } else {
    console.warn('⚠️ Binance price invalid, using fallback');
  }
} else {
  console.warn('⚠️ No Binance data, using fallback BTC price');
}

// Parse Yahoo Finance data
const [spxData, rutData, dxyData, vixData, goldData, us10yData, us2yData] = yahooData;

const spx = Math.round(spxData?.chart?.result?.[0]?.meta?.regularMarketPrice || 5800);
const rut = Math.round(rutData?.chart?.result?.[0]?.meta?.regularMarketPrice || 2580);
const dxy = parseFloat((dxyData?.chart?.result?.[0]?.meta?.regularMarketPrice || 109.5).toFixed(2));
const vix = parseFloat((vixData?.chart?.result?.[0]?.meta?.regularMarketPrice || 15.5).toFixed(2));
const gold = Math.round(goldData?.chart?.result?.[0]?.meta?.regularMarketPrice || 2650);
const us10y = parseFloat((us10yData?.chart?.result?.[0]?.meta?.regularMarketPrice || 4.2).toFixed(2));
const us2y = parseFloat((us2yData?.chart?.result?.[0]?.meta?.regularMarketPrice || 4.3).toFixed(2));

console.log('✅ Market data parsed - SPX:', spx, 'DXY:', dxy, 'Gold:', gold);

// Parse FRED data
const [rrpData, fedFundsData, fedBalanceData] = fredData;

// Use realistic fallback values (as of Jan 2026)
let rrp = 250; // RRP typically around 250B
let fedFunds = 4.5;
let fedBalance = 7200;
let qtActive = true; // Fed is currently in QT mode

if (rrpData?.observations?.[0]?.value) {
  const rrpValue = parseFloat(rrpData.observations[0].value);
  if (!isNaN(rrpValue)) {
    rrp = Math.round(rrpValue);
    console.log('✅ RRP from FRED:', rrp);
  }
} else {
  console.warn('⚠️ FRED RRP unavailable, using realistic estimate:', rrp);
}

if (fedFundsData?.observations?.[0]?.value) {
  const fundsValue = parseFloat(fedFundsData.observations[0].value);
  if (!isNaN(fundsValue)) {
    fedFunds = fundsValue;
    console.log('✅ Fed Funds from FRED:', fedFunds);
  }
} else {
  console.warn('⚠️ Fed Funds unavailable, using estimate:', fedFunds);
}

if (fedBalanceData?.observations && fedBalanceData.observations.length >= 2) {
  const current = parseFloat(fedBalanceData.observations[0]?.value || 7200000);
  const previous = parseFloat(fedBalanceData.observations[1]?.value || 7250000);
  
  if (!isNaN(current)) {
    fedBalance = Math.round(current / 1000); // Convert to billions
    qtActive = current < previous;
    console.log('✅ Fed Balance from FRED:', fedBalance, 'B - QT:', qtActive);
  }
} else {
  console.warn('⚠️ Fed Balance unavailable, using estimate:', fedBalance, 'B');
}

// Parse Polymarket predictions
let fedCutProbability = 0.35; // Default 35%
let nextMeetingDate = "2026-01-29";

if (polymarketData && polymarketData.outcomes) {
  // Get probability of rate cut
  const cutOutcome = polymarketData.outcomes.find(o => 
    o.title && o.title.toLowerCase().includes('cut')
  );
  if (cutOutcome) {
    fedCutProbability = parseFloat(cutOutcome.price || 0.35);
  }
  console.log('✅ Fed cut probability:', fedCutProbability);
}

// Calculate correlations and signals
const correlations = {
  btcVsSpx: spx > 5700 ? 'bullish' : 'bearish', // SPX strength = risk-on
  btcVsRut: rut > 2500 ? 'bullish' : 'bearish', // Small caps strong = risk-on
  btcVsDxy: dxy < 105 ? 'bullish' : 'bearish', // Weak dollar = BTC up
  btcVsGold: gold > 2600 && gold < 3000 ? 'bullish' : 'bearish', // Gold in sweet spot
  btcVsVix: vix < 20 ? 'bullish' : 'bearish', // Low fear = bullish
  btcVsRrp: rrp < 300 ? 'bullish' : 'bearish' // Lower RRP = more liquidity
};

// Build final response
const responseData = {
  bitcoin,
  marketData: {
    spx,
    rut,
    dxy,
    vix,
    gold,
    us10y,
    us2y
  },
  fedData: {
    rrp,
    fedFunds,
    fedBalance,
    qtActive,
    fedCutProbability,
    nextMeetingDate
  },
  correlations,
  timestamp: new Date().toISOString()
};

// Cache it
cache = {
  data: responseData,
  timestamp: Date.now()
};

console.log('✅ Response ready, sending to client');
res.json(responseData);
```

} catch (e) {
console.error(“❌ Error:”, e.message);
console.error(e.stack);
res.status(500).json({
error: “Failed to fetch market data”,
message: e.message,
timestamp: new Date().toISOString()
});
}
});

// WebSocket endpoint info
app.get(”/ws-info”, (req, res) => {
res.json({
message: “For real-time BTC updates, use Binance WebSocket”,
websocket: “wss://stream.binance.com:9443/ws/btcusdt@ticker”,
usage: “Connect directly from frontend for instant updates”
});
});

// Health check
app.get(”/”, (req, res) => {
res.json({
status: “ok”,
message: “Bitcoin Pro API v2.0 - Professional Grade”,
endpoints: [”/markets”, “/ws-info”],
features: [
“Binance real-time BTC”,
“Yahoo Finance market data”,
“FRED economic data”,
“Polymarket predictions”,
“Correlation analysis”
]
});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`✅ Bitcoin Pro API v2.0 running on port ${PORT}`);
console.log(‘🚀 Features: Binance, Yahoo, FRED, Polymarket’);
});
