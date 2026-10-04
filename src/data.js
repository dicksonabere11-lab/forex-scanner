// data.js
// Fetches candles from Twelve Data.

const BASE_URL = 'https://api.twelvedata.com';

export async function fetchCandles(symbol, interval, apiKey, outputsize = 300) {
  const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}` +
              `&interval=${interval}` +
              `&outputsize=${outputsize}` +
              `&apikey=${apiKey}` +
              `&order=ASC`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Twelve Data HTTP ${res.status} for ${symbol}`);
  }
  const json = await res.json();
  if (json.status === 'error' || json.code) {
    throw new Error(`Twelve Data error for ${symbol}: ${json.message || 'unknown'}`);
  }
  if (!json.values || !Array.isArray(json.values)) {
    throw new Error(`No candle data for ${symbol}`);
  }
  const candles = json.values.map(v => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseFloat(v.volume) : 0,
  }));
  if (candles.length > 1) candles.pop();
  return { candles };
}

export async function fetchPreviousDayHL(symbol, apiKey) {
  const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}` +
              `&interval=1day` +
              `&outputsize=3` +
              `&apikey=${apiKey}` +
              `&order=ASC`;
  const res = await fetch(url);
  if (!res.ok) return { pdh: null, pdl: null };
  const json = await res.json();
  if (!json.values || json.values.length < 2) return { pdh: null, pdl: null };
  const prev = json.values[json.values.length - 2];
  return {
    pdh: parseFloat(prev.high),
    pdl: parseFloat(prev.low),
  };
                       }
