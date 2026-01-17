import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Bitcoin price endpoint
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

// Stock market data endpoint
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

// Fed Funds Rate endpoint
app.get("/api/fed-rate", async (req, res) => {
  try {
    const response = await fetch("https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=YOUR_FRED_API_KEY&file_type=json&sort_order=desc&limit=1");
    const data = await response.json();
    const rate = parseFloat(data.observations[0].value);
    res.json({ rate });
  } catch (error) {
    console.error("Error fetching Fed rate:", error);
    res.status(500).json({ error: "Failed to fetch Fed rate" });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Bitcoin Pro Backend API" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
