// structure.js
// Detect swing pivots and classify market structure.

export function findPivotHighs(candles, N = 3) {
  const pivots = [];
  for (let i = N; i < candles.length - N; i++) {
    let ok = true;
    for (let k = 1; k <= N; k++) {
      if (candles[i].high <= candles[i - k].high ||
          candles[i].high <= candles[i + k].high) {
        ok = false;
        break;
      }
    }
    if (ok) {
      pivots.push({
        index: i,
        price: candles[i].high,
        type: 'high',
        confirmedAtIndex: i + N,
      });
    }
  }
  return pivots;
}

export function findPivotLows(candles, N = 3) {
  const pivots = [];
  for (let i = N; i < candles.length - N; i++) {
    let ok = true;
    for (let k = 1; k <= N; k++) {
      if (candles[i].low >= candles[i - k].low ||
          candles[i].low >= candles[i + k].low) {
        ok = false;
        break;
      }
    }
    if (ok) {
      pivots.push({
        index: i,
        price: candles[i].low,
        type: 'low',
        confirmedAtIndex: i + N,
      });
    }
  }
  return pivots;
}

export function classifyStructure(highs, lows, lookback = 4) {
  if (highs.length < 2 || lows.length < 2) return 'unclear';
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  const seq = [...recentHighs, ...recentLows].sort((a, b) => a.index - b.index);
  if (seq.length < 4) return 'unclear';
  let hh = 0, hl = 0, lh = 0, ll = 0;
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    const cur = seq[i];
    if (prev.type === 'high' && cur.type === 'high') {
      if (cur.price > prev.price) hh++;
      else lh++;
    }
    if (prev.type === 'low' && cur.type === 'low') {
      if (cur.price > prev.price) hl++;
      else ll++;
    }
  }
  if (hh >= 1 && hl >= 1 && lh === 0 && ll === 0) return 'uptrend';
  if (lh >= 1 && ll >= 1 && hh === 0 && hl === 0) return 'downtrend';
  if (hh + hl > lh + ll) return 'uptrend_weak';
  if (lh + ll > hh + hl) return 'downtrend_weak';
  return 'ranging';
}

export function lastSwingLow(lows, beforeIndex) {
  for (let i = lows.length - 1; i >= 0; i--) {
    if (lows[i].confirmedAtIndex <= beforeIndex) return lows[i];
  }
  return null;
}

export function lastSwingHigh(highs, beforeIndex) {
  for (let i = highs.length - 1; i >= 0; i--) {
    if (highs[i].confirmedAtIndex <= beforeIndex) return highs[i];
  }
  return null;
}

export function roundNumberLevels(price, pipSize) {
  const levels = [];
  if (pipSize === 0.0001) {
    const step = 0.0050;
    const below = Math.floor(price / step) * step;
    const above = below + step;
    levels.push(below, above);
  } else if (pipSize === 0.01 && price > 100) {
    const step = 50;
    const below = Math.floor(price / step) * step;
    const above = below + step;
    levels.push(below, above);
  } else if (pipSize === 1) {
    const step = 500;
    const below = Math.floor(price / step) * step;
    const above = below + step;
    levels.push(below, above);
  } else if (pipSize === 0.01 && price < 100) {
    const step = Math.max(1, Math.round(price * 0.01));
    const below = Math.floor(price / step) * step;
    const above = below + step;
    levels.push(below, above);
  }
  return levels;
    }
