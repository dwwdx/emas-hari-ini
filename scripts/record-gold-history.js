'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HISTORY_FILE = path.join(process.cwd(), 'gold-history.json');
const SOURCE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const SOURCES = [
  'https://api.hargaemas.my/prices',
  'https://hargaemas.my/api/gold-prices.json'
];

async function getCurrentPrice() {
  const errors = [];
  for (const url of SOURCES) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const sell = Number(data && data.prices && data.prices.spotSellRmPerKg);
      const buy = Number(data && data.prices && data.prices.spotBuyRmPerKg);
      const sourceUpdatedAt = Date.parse(data && data.lastUpdate);
      const age = Date.now() - sourceUpdatedAt;
      if (!Number.isFinite(sell) || sell <= 1000 || sell >= 10000000 || !Number.isFinite(buy) || buy <= 0) {
        throw new Error('Format harga tidak sah');
      }
      if (!Number.isFinite(sourceUpdatedAt) || age < -5 * 60 * 1000 || age > SOURCE_MAX_AGE_MS || data.isStale) {
        throw new Error('Sumber harga sudah lapuk');
      }
      return { sellRmPerGram: sell / 1000, buyRmPerGram: buy / 1000, sourceUpdatedAt: new Date(sourceUpdatedAt).toISOString() };
    } catch (error) {
      errors.push(url + ': ' + error.message);
    }
  }
  throw new Error('Kedua-dua sumber harga gagal. ' + errors.join(' | '));
}

async function main() {
  const price = await getCurrentPrice();
  const now = new Date();
  const data = fs.existsSync(HISTORY_FILE)
    ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
    : { version: 1, currency: 'MYR', unit: 'gram', karat: '999', sampleIntervalHours: 4, retentionDays: 365, samples: [] };
  if (!Array.isArray(data.samples)) throw new Error('Struktur gold-history.json tidak sah');

  const newest = data.samples[data.samples.length - 1];
  if (newest && Number.isFinite(Date.parse(newest.recordedAt)) && now.getTime() - Date.parse(newest.recordedAt) < 3 * 60 * 60 * 1000) {
    console.log('Rekod terkini masih baharu; tiada kemas kini diperlukan.');
    return;
  }

  data.version = 1;
  data.currency = 'MYR';
  data.unit = 'gram';
  data.karat = '999';
  data.sampleIntervalHours = 4;
  data.retentionDays = 365;
  data.updatedAt = now.toISOString();
  data.samples.push({ recordedAt: now.toISOString(), sourceUpdatedAt: price.sourceUpdatedAt, sellRmPerGram: price.sellRmPerGram, buyRmPerGram: price.buyRmPerGram });
  const cutoff = now.getTime() - RETENTION_MS;
  data.samples = data.samples.filter(sample => Date.parse(sample.recordedAt) >= cutoff).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('Direkod: RM ' + price.sellRmPerGram.toFixed(2) + '/g; jumlah bacaan ' + data.samples.length + '.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
