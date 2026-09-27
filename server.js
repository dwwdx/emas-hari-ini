const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const CACHE_MS = 120000;
const MAX_SOURCE_AGE_MS = 6 * 60 * 60 * 1000;
const SOURCES = [
  {
    name: 'hargaemas.my',
    url: 'https://api.hargaemas.my/prices',
    normalize(payload) { return payload; }
  },
  {
    name: 'hargaemas.my fallback',
    url: 'https://hargaemas.my/api/gold-prices.json',
    normalize(payload) { return payload; }
  }
];
let cache = { data: null, time: 0 };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': type.startsWith('application/json') ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function validPrice(data) {
  const value = Number(data?.prices?.spotSellRmPerKg);
  return Number.isFinite(value) && value > 1000 && value < 10000000 && data?.lastUpdate;
}

function normalizeData(data, sourceName) {
  if (!validPrice(data)) return null;
  const timestamp = Date.parse(data.lastUpdate);
  const tooOld = !Number.isFinite(timestamp) || Date.now() - timestamp > MAX_SOURCE_AGE_MS;
  return { ...data, source: data.source || sourceName, isStale: Boolean(data.isStale) || tooOld };
}

async function goldPrice(res, force = false) {
  if (!force && cache.data && Date.now() - cache.time < CACHE_MS) {
    return send(res, 200, JSON.stringify({ ...cache.data, servedFromCache: true, checkedAt: new Date().toISOString() }));
  }
  let staleCandidate = null;
  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) continue;
      const data = normalizeData(source.normalize(await response.json()), source.name);
      if (!data) continue;
      data.checkedAt = new Date().toISOString();
      if (data.isStale) { staleCandidate ||= data; continue; }
      cache = { data, time: Date.now() };
      return send(res, 200, JSON.stringify(data));
    } catch {}
  }
  if (cache.data) return send(res, 200, JSON.stringify({ ...cache.data, servedFromCache: true, checkedAt: new Date().toISOString() }));
  if (staleCandidate) return send(res, 200, JSON.stringify({ ...staleCandidate, staleReason: 'Sumber harga belum dikemas kini.' }));
  send(res, 502, JSON.stringify({ error: 'Sumber harga tidak dapat dicapai' }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/gold-price') return goldPrice(res, url.searchParams.get('refresh') === '1');
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  send(res, 200, fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, '0.0.0.0', () => console.log(`EmasHarini ready on port ${PORT}`));