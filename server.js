import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(__dirname));

// Main markets endpoint that frontend expects
app.get("/markets", async (req, res) => {
  try {
    const btcResponse = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
    const btcData = await btcResponse.json();
    
    const [spx, dxy, gold, rut, vix] = await Promise.all([
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d").then(r => r.json()),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=1d").then(r => r.json()),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d").then(r => r.json()),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ERUT?interval=1d&range=1d").then(r => r.json()),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d").then(r => r.json())
    ]);

    res.json({
      bitcoin: {
        price: parseFloat(btcData.lastPrice),
        change24h: parseFloat(btcData.priceChangePercent),
        volume24h: (parseFloat(btcData.volume) / 1000000000).toFixed(2),
        marketCap: ((parseFloat(btcData.lastPrice) * 19500000) / 1000000000000).toFixed(2)
      },
      marketData: {
        spx: Math.round(spx.chart.result[0].meta.regularMarketPrice),
        dxy: dxy.chart.result[0].meta.regularMarketPrice.toFixed(2),
        gold: Math.round(gold.chart.result[0].meta.regularMarketPrice),
        rut: Math.round(rut.chart.result[0].meta.regularMarketPrice),
        vix: vix.chart.result[0].meta.regularMarketPrice.toFixed(2)
      },
      fedData: {
        rrp: 450,
        fedFunds: 4.50,
        fedCutProbability: 0.65,
        nextMeetingDate: "Jan 29, 2025",
        fedBalance: 7200,
        qtActive: true
      }
    });
  } catch (error) {
    console.error("Error in /markets endpoint:", error);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
});

app.get("/api/bitcoin-price", async (req, res) => {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await response.json();
    res.json({ price: parseFloat(data.price) });
  } catch (error) {
    console.error("Error fetching Bitcoin price:", error);
    res.status(500).json({ error: "Failed to fetch Bitcoin price" });
  }
});

app.get("/api/stock/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
    const data = await response.json();
    const result = data.chart.result[0];
    const price = result.meta.regularMarketPrice;
    const previousClose = result.meta.previousClose;
    const change = ((price - previousClose) / previousClose) * 100;
    
    res.json({
      symbol,
      price,
      change: change.toFixed(2)
    });
  } catch (error) {
    console.error(`Error fetching stock data for ${req.params.symbol}:`, error);
    res.status(500).json({ error: `Failed to fetch stock data for ${req.params.symbol}` });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
