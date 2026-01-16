import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors({ origin: "*" }));

let cache = { data: null, timestamp: 0 };
const CACHE_DURATION = 30000;

app.get("/markets", async (req, res) => {
  try {
    console.log("📊 Markets endpoint called");
    
    if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
      console.log("✅ Returning cached data");
      return res.json(cache.data);
    }

    console.log("🔄 Fetching fresh data...");

    const [btcData, goldData, yahooData, fredData] = await Promise.all([
      // Bitcoin from Binance
      fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
        .then(r => r.json())
        .then(data => {
          console.log("✅ Binance BTC:", data.lastPrice);
          return data;
        })
        .catch(err => {
          console.error("❌ Binance failed:", err.message);
          return fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true")
            .then(r => r.json())
            .catch(() => null);
        }),
      
      // Gold
      fetch("https://api.metals.live/v1/spot/gold")
        .then(r => r.json())
        .then(data => ({ price: data[0] }))
        .catch(() => ({ price: 2650 })),
      
      // Yahoo Finance - S&P 500, Russell, DXY, VIX, Yields
      Promise.all([
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d")
          .then(r => r.json()).catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ERUT?interval=1d&range=1d")
          .then(r => r.json()).catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=1d")
          .then(r => r.json()).catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d")
          .then(r => r.json()).catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d")
          .then(r => r.json()).catch(() => null),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1d&range=1d")
          .then(r => r.json()).catch(() => null)
      ]),
      
      // FRED Data - RRP, Fed Funds, Balance Sheet
      Promise.all([
        fetch("https://api.stlouisfed.org/fred/series/observations?series_id=RRPONTSYD&api_key=demo&file_type=json&limit=1&sort_order=desc")
          .then(r => r.json()).catch(() => null),
        fetch("https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=demo&file_type=json&limit=1&sort_order=desc")
          .then(r => r.json()).catch(() => null),
        fetch("https://api.stlouisfed.org/fred/series/observations?series_id=WALCL&api_key=demo&file_type=json&limit=2&sort_order=desc")
          .then(r => r.json()).catch(() => null)
      ])
    ]);

    // Parse Bitcoin
    let bitcoin = { price: 96500, change24h: 2.5, volume24h: "45.0", marketCap: "1.88" };
    
    if (btcData && btcData.lastPrice) {
      const price = parseFloat(btcData.lastPrice);
      const change = parseFloat(btcData.priceChangePercent);
      const volume = parseFloat(btcData.volume);
      bitcoin = {
        price: Math.round(price),
        change24h: parseFloat(change.toFixed(2)),
        volume24h: ((volume * price) / 1000000000).toFixed(1),
        marketCap: (price * 19.5 / 1000).toFixed(2)
      };
    } else if (btcData && btcData.bitcoin) {
      bitcoin = {
        price: Math.round(btcData.bitcoin.usd),
        change24h: parseFloat(btcData.bitcoin.usd_24h_change.toFixed(2)),
        volume24h: (btcData.bitcoin.usd_24h_vol / 1000000000).toFixed(1),
        marketCap: (btcData.bitcoin.usd * 19.5 / 1000).toFixed(2)
      };
    }

    // Parse Yahoo
    const spx = Math.round(yahooData[0]?.chart?.result?.[0]?.meta?.regularMarketPrice || 5950);
    const rut = Math.round(yahooData[1]?.chart?.result?.[0]?.meta?.regularMarketPrice || 2580);
    const dxy = parseFloat((yahooData[2]?.chart?.result?.[0]?.meta?.regularMarketPrice || 109.5).toFixed(2));
    const vix = parseFloat((yahooData[3]?.chart?.result?.[0]?.meta?.regularMarketPrice || 15.5).toFixed(2));
    const us10y = parseFloat((yahooData[4]?.chart?.result?.[0]?.meta?.regularMarketPrice || 4.2).toFixed(2));
    const us2y = parseFloat((yahooData[5]?.chart?.result?.[0]?.meta?.regularMarketPrice || 4.3).toFixed(2));

    // Parse FRED
    let rrp = 250;
    let fedFunds = 4.5;
    let fedBalance = 7200;
    let qtActive = true;
    
    if (fredData[0]?.observations?.[0]?.value) {
      rrp = Math.round(parseFloat(fredData[0].observations[0].value));
    }
    if (fredData[1]?.observations?.[0]?.value) {
      fedFunds = parseFloat(fredData[1].observations[0].value);
    }
    if (fredData[2]?.observations && fredData[2].observations.length >= 2) {
      const current = parseFloat(fredData[2].observations[0]?.value || 7200000);
      const previous = parseFloat(fredData[2].observations[1]?.value || 7250000);
      fedBalance = Math.round(current / 1000);
      qtActive = current < previous;
    }

    const responseData = {
      bitcoin,
      marketData: { spx, rut, dxy, vix, gold: Math.round(goldData.price), us10y, us2y },
      fedData: { rrp, fedFunds, fedBalance, qtActive, fedCutProbability: 0.35, nextMeetingDate: "2026-01-29" },
      timestamp: new Date().toISOString()
    };

    cache = { data: responseData, timestamp: Date.now() };
    console.log("✅ Response ready");
    res.json(responseData);
  } catch (e) {
    console.error("❌ Error:", e.message);
    res.status(500).json({ error: "Failed to fetch data", message: e.message });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Bitcoin Pro API v2.0", endpoints: ["/markets"] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
