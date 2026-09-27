const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SOURCES = [
  'https://api.hargaemas.my/prices',
  'https://hargaemas.my/api/gold-prices.json'
];
let cache = { data: null, time: 0 };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': type.startsWith('application/json') ? 'public, max-age=120' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function validPrice(data) {
  const value = Number(data?.prices?.spotSellRmPerKg);
  return Number.isFinite(value) && value > 1000 && value < 10000000 && data.lastUpdate;
}

async function goldPrice(res, force = false) {
  if (!force && cache.data && Date.now() - cache.time < 120000) {
    return send(res, 200, JSON.stringify(cache.data));
  }
  for (const url of SOURCES) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (!validPrice(data)) continue;
      cache = { data, time: Date.now() };
      return send(res, 200, JSON.stringify(data));
    } catch {}
  }
  if (cache.data) {
    return send(res, 200, JSON.stringify({ ...cache.data, servedFromCache: true }));
  }
  send(res, 502, JSON.stringify({ error: 'Sumber harga tidak dapat dicapai' }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/gold-price') return goldPrice(res, url.searchParams.get('refresh') === '1');
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  send(res, 200, fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, '0.0.0.0', () => console.log(`EmasHarini ready on port ${PORT}`));
