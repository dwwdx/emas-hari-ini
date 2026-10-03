import { readFile, writeFile } from "node:fs/promises";

const TARGET = process.argv[2] || "data/gold-history.json";
const MAX_SOURCE_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_HISTORY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_POINTS = 2016;
const SOURCES = [
  { name: "hargaemas.my API", url: "https://api.hargaemas.my/prices" },
  { name: "hargaemas.my fallback", url: "https://hargaemas.my/api/gold-prices.json" }
];

async function fetchValidSource(source) {
  const response = await fetch(source.url, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(source.name + " HTTP " + response.status);
  const data = await response.json();
  const sell = Number(data?.prices?.spotSellRmPerKg);
  const buy = Number(data?.prices?.spotBuyRmPerKg);
  const sourceTime = Date.parse(data?.lastUpdate);
  const sourceAge = Date.now() - sourceTime;
  if (!Number.isFinite(sell) || sell <= 1000 || sell >= 10000000 || !Number.isFinite(buy) || buy <= 0) throw new Error(source.name + " returned invalid prices");
  if (!Number.isFinite(sourceTime) || sourceAge > MAX_SOURCE_AGE_MS || sourceAge < -5 * 60 * 1000 || data.isStale || Number(data.staleAgeMinutes) > 360) throw new Error(source.name + " returned stale or invalid timestamp data");
  return { data, source: data.source || source.name };
}

let quote;
const errors = [];
for (const source of SOURCES) {
  try { quote = await fetchValidSource(source); break; }
  catch (error) { errors.push(source.name + ": " + error.message); }
}
if (!quote) throw new Error("No fresh gold-price source available: " + errors.join("; "));

let history = { version: 1, points: [] };
try {
  history = JSON.parse(await readFile(TARGET, "utf8"));
  if (history.version !== 1 || !Array.isArray(history.points)) throw new Error("Unsupported history format");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const now = Date.now();
let observedAt = new Date(now).toISOString();
const previousTime = Date.parse(history.points.at(-1)?.time);
if (Number.isFinite(previousTime) && Date.parse(observedAt) <= previousTime) observedAt = new Date(previousTime + 1).toISOString();
const sellRmPerKg = Number(quote.data.prices.spotSellRmPerKg);
const price999 = Math.round((sellRmPerKg / 1000) * 100) / 100;
const cutoff = now - MAX_HISTORY_AGE_MS;
const points = history.points
  .filter(point => Number.isFinite(Date.parse(point?.time)) && Number.isFinite(Number(point?.value)) && Number(point.value) > 0)
  .filter(point => Date.parse(point.time) >= cutoff)
  .map(point => ({ time: new Date(Date.parse(point.time)).toISOString(), value: Number(point.value) }));
points.push({ time: observedAt, value: price999 });
const boundedPoints = points.slice(-MAX_POINTS);
const output = {
  version: 1,
  source: quote.source,
  updatedAt: observedAt,
  lastUpdate: quote.data.lastUpdate,
  prices: quote.data.prices,
  points: boundedPoints
};
await writeFile(TARGET, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log("Recorded RM " + price999.toFixed(2) + "/g at " + observedAt + " from " + quote.source + "; points=" + boundedPoints.length);
