const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed')); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

app.get('/markets', async (req, res) => {
  try {
    const btcData = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true');
    const btc = btcData.bitcoin;

    async function getYahoo(symbol) {
      try {
        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`)}`;
        const d = await fetchJSON(url);
        return parseFloat(d?.chart?.result?.[0]?.meta?.regularMarketPrice || 0);
      } catch { return 0; }
    }

    const [spx, dxy, gold, rut, vix] = await Promise.all([
      getYahoo('%5EGSPC'), getYahoo('DX-Y.NYB'), getYahoo('GC=F'),
      getYahoo('%5ERUT'), getYahoo('%5EVIX')
    ]);

    res.json({
      bitcoin: {
        price: Math.round(btc.usd),
        change24h: parseFloat(btc.usd_24h_change?.toFixed(2) || 0),
        volume24h: parseFloat((btc.usd_24h_vol / 1e9).toFixed(1)),
        marketCap: parseFloat((btc.usd_market_cap / 1e12).toFixed(2))
      },
      marketData: { spx: Math.round(spx), dxy: parseFloat(dxy.toFixed(2)), gold: Math.round(gold), rut: Math.round(rut), vix: parseFloat(vix.toFixed(1)) },
      fedData: { rrp: 98, fedFunds: 4.33, fedCutProbability: 0.72, nextMeetingDate: 'May 7 2025', fedBalance: 6800, qtActive: true }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ai', async (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const payload = JSON.stringify(req.body);
  const options = {
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try { res.status(apiRes.statusCode).json(JSON.parse(data)); }
      catch(e) { res.status(500).json({ error: 'Invalid response from Anthropic' }); }
    });
  });
  apiReq.on('error', (e) => res.status(500).json({ error: e.message }));
  apiReq.setTimeout(30000, () => { apiReq.destroy(); res.status(504).json({ error: 'AI timeout' }); });
  apiReq.write(payload);
  apiReq.end();
});

app.listen(PORT, () => console.log('Bitcoin Pro backend running on port ' + PORT));
