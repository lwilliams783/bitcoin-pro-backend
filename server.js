import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

// Cache to avoid hitting APIs too often
let cache = {
  data: null,
  timestamp: 0
};

const CACHE_DURATION = 30000; // 30 seconds

app.get("/markets", async (req, res) => {
  try {
    // Return cached data if fresh
    if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
      return res.json(cache.data);
    }

    // Fetch all data in parallel
    const [btcData, goldData, yahooData] = await Promise.all([
      // Bitcoin from CoinGecko
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true")
        .then(r => r.json())
        .catch(() => ({ bitcoin: { usd: 95000, usd_24h_change: 2.5, usd_24h_vol: 45000000000 } })),
      
      // Gold from Metals.live
      fetch("https://api.metals.live/v1/spot/gold")
        .then(r => r.json())
        .then(data => ({ price: data[0] }))
        .catch(() => ({ price: 2650 })),
      
      // Yahoo Finance for DXY, Russell 2000, VIX
      Promise.all([
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=1d")
          .then(r => r.json())
          .catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ERUT?interval=1d&range=1d")
          .then(r => r.json())
          .catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d")
          .then(r => r.json())
          .catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d")
          .then(r => r.json())
          .catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETYX?interval=1d&range=1d")
          .then(r => r.json())
          .catch(() => null)
      ])
    ]);

    // Parse Bitcoin data
    const bitcoin = {
      price: Math.round(btcData.bitcoin?.usd || 95000),
      change24h: parseFloat((btcData.bitcoin?.usd_24h_change || 2.5).toFixed(2)),
      volume24h: ((btcData.bitcoin?.usd_24h_vol || 45000000000) / 1000000000).toFixed(1),
      marketCap: ((btcData.bitcoin?.usd || 95000) * 19.5 / 1000).toFixed(2)
    };

    // Parse Gold
    const gold = Math.round(goldData.price || 2650);

    // Parse Yahoo data
    const dxy = yahooData[0]?.chart?.result?.[0]?.meta?.regularMarketPrice?.toFixed(2) || "109.07";
    const rut = Math.round(yahooData[1]?.chart?.result?.[0]?.meta?.regularMarketPrice || 2582);
    const vix = yahooData[2]?.chart?.result?.[0]?.meta?.regularMarketPrice?.toFixed(2) || "14.67";
    const us10y = yahooData[3]?.chart?.result?.[0]?.meta?.regularMarketPrice?.toFixed(2) || "4.18";
    const us30y = yahooData[4]?.chart?.result?.[0]?.meta?.regularMarketPrice?.toFixed(2) || "4.81";

    // Build response
    const responseData = {
      bitcoin,
      gold,
      dxy: parseFloat(dxy),
      rut,
      vix: parseFloat(vix),
      us2y: 3.54, // Would need FRED API key for real-time
      us10y: parseFloat(us10y),
      us20y: parseFloat(us30y),
      timestamp: new Date().toISOString()
    };

    // Cache it
    cache = {
      data: responseData,
      timestamp: Date.now()
    };

    res.json(responseData);
  } catch (e) {
    console.error("Error:", e);
    res.status(500).json({ 
      error: "Failed to fetch market data",
      message: e.message 
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Bitcoin Pro API is running",
    endpoints: ["/markets"]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
