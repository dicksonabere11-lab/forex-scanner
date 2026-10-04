// strategies.js
// 4 trend-following strategies + trigger detection + scoring.

export function trendPullback(ctx) {
  const { candles, ema20, ema50, ema200, rsi14, structure } = ctx;
  const i = candles.length - 1;
  if (i < 200) return { fires: false, direction: null, weight: 0, reason: 'warmup' };
  const c = candles[i];
  const close = c.close;
  const nearEma20 = Math.abs(close - ema20[i]) / close < 0.005;
  if ((structure === 'uptrend' || structure === 'uptrend_weak') &&
      ema50[i] > ema200[i] &&
      nearEma20 &&
      rsi14[i] > 40 && rsi14[i] < 55 &&
      c.close > c.open) {
    return {
      fires: true,
      direction: 'long',
      weight: 30,
      reason: `Uptrend pullback to EMA20, RSI ${rsi14[i].toFixed(1)}`,
    };
  }
  if ((structure === 'downtrend' || structure === 'downtrend_weak') &&
      ema50[i] < ema200[i] &&
      nearEma20 &&
      rsi14[i] > 45 && rsi14[i] < 60 &&
      c.close < c.open) {
    return {
      fires: true,
      direction: 'short',
      weight: 30,
      reason: `Downtrend pullback to EMA20, RSI ${rsi14[i].toFixed(1)}`,
    };
  }
  return { fires: false, direction: null, weight: 0, reason: 'no pullback setup' };
}

export function breakOfStructure(ctx) {
  const { candles, atr14, structure } = ctx;
  const i = candles.length - 1;
  if (i < 30) return { fires: false, direction: null, weight: 0, reason: 'warmup' };
  const lookback = 20;
  const slice = candles.slice(i - lookback, i);
  const recentHigh = Math.max(...slice.map(c => c.high));
  const recentLow = Math.min(...slice.map(c => c.low));
  const c = candles[i];
  const range = c.high - c.low;
  if ((structure === 'uptrend' || structure === 'uptrend_weak') &&
      c.close > recentHigh &&
      range > 0.5 * atr14[i]) {
    return {
      fires: true,
      direction: 'long',
      weight: 25,
      reason: `Broke 20-bar high with momentum`,
    };
  }
  if ((structure === 'downtrend' || structure === 'downtrend_weak') &&
      c.close < recentLow &&
      range > 0.5 * atr14[i]) {
    return {
      fires: true,
      direction: 'short',
      weight: 25,
      reason: `Broke 20-bar low with momentum`,
    };
  }
  return { fires: false, direction: null, weight: 0, reason: 'no break' };
}

export function maCrossover(ctx) {
  const { ema20, ema50 } = ctx;
  const i = ema20.length - 1;
  for (let k = 0; k < 3; k++) {
    const idx = i - k;
    if (idx < 1 || ema20[idx] == null || ema50[idx] == null) break;
    const prev = ema20[idx - 1] - ema50[idx - 1];
    const cur = ema20[idx] - ema50[idx];
    if (prev < 0 && cur > 0) {
      return {
        fires: k === 0,
        direction: 'long',
        weight: 15,
        reason: 'EMA20 crossed above EMA50',
      };
    }
    if (prev > 0 && cur < 0) {
      return {
        fires: k === 0,
        direction: 'short',
        weight: 15,
        reason: 'EMA20 crossed below EMA50',
      };
    }
  }
  return { fires: false, direction: null, weight: 0, reason: 'no cross' };
}

export function retestOfBrokenLevel(ctx) {
  const { candles, atr14, structure } = ctx;
  const i = candles.length - 1;
  if (i < 30) return { fires: false, direction: null, weight: 0, reason: 'warmup' };
  const lookback = 20;
  const slice = candles.slice(i - lookback, i - 1);
  const recentHigh = Math.max(...slice.map(c => c.high));
  const recentLow = Math.min(...slice.map(c => c.low));
  const c = candles[i];
  const tol = 0.5 * atr14[i];
  if (structure === 'uptrend' || structure === 'uptrend_weak') {
    let brokeAbove = false;
    for (let k = 3; k <= 10 && i - k >= 0; k++) {
      if (candles[i - k].close > recentHigh) { brokeAbove = true; break; }
    }
    if (brokeAbove &&
        Math.abs(c.low - recentHigh) < tol &&
        c.close > recentHigh) {
      return {
        fires: true,
        direction: 'long',
        weight: 15,
        reason: `Retested broken resistance`,
      };
    }
  }
  if (structure === 'downtrend' || structure === 'downtrend_weak') {
    let brokeBelow = false;
    for (let k = 3; k <= 10 && i - k >= 0; k++) {
      if (candles[i - k].close < recentLow) { brokeBelow = true; break; }
    }
    if (brokeBelow &&
        Math.abs(c.high - recentLow) < tol &&
        c.close < recentLow) {
      return {
        fires: true,
        direction: 'short',
        weight: 15,
        reason: `Retested broken support`,
      };
    }
  }
  return { fires: false, direction: null, weight: 0, reason: 'no retest' };
}

export function detectTrigger(candles) {
  const i = candles.length - 1;
  if (i < 2) return { present: false, type: null, direction: null };
  const c = candles[i];
  const p = candles[i - 1];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const upperWick = c.high - Math.max(c.close, c.open);
  if (range > 0 && body > 0 &&
      lowerWick >= 2 * body &&
      Math.min(c.close, c.open) >= c.low + (2 / 3) * range &&
      upperWick <= body) {
    return { present: true, type: 'bullish_rejection', direction: 'long' };
  }
  if (range > 0 && body > 0 &&
      upperWick >= 2 * body &&
      Math.max(c.close, c.open) <= c.high - (2 / 3) * range &&
      lowerWick <= body) {
    return { present: true, type: 'bearish_rejection', direction: 'short' };
  }
  if (p.close < p.open && c.close > c.open &&
      c.open <= p.close && c.close >= p.open) {
    return { present: true, type: 'bullish_engulfing', direction: 'long' };
  }
  if (p.close > p.open && c.close < c.open &&
      c.open >= p.close && c.close <= p.open) {
    return { present: true, type: 'bearish_engulfing', direction: 'short' };
  }
  if (c.close > c.open) {
    for (let k = 2; k <= 5 && i - k >= 0; k++) {
      if (candles[i - k].close < candles[i - k].open &&
          c.close > candles[i - k].high) {
        return { present: true, type: 'break_of_opposing', direction: 'long' };
      }
    }
  }
  if (c.close < c.open) {
    for (let k = 2; k <= 5 && i - k >= 0; k++) {
      if (candles[i - k].close > candles[i - k].open &&
          c.close < candles[i - k].low) {
        return { present: true, type: 'break_of_opposing', direction: 'short' };
      }
    }
  }
  return { present: false, type: null, direction: null };
}

export function nearSupportResistance(ctx, direction) {
  const { candles, atr14, swingHighs, swingLows, pdh, pdl, roundLevels } = ctx;
  const i = candles.length - 1;
  const close = candles[i].close;
  const tol = 0.5 * atr14[i];
  const levels = [];
  if (swingHighs.length > 0) {
    const s = swingHighs[swingHighs.length - 1];
    levels.push({ name: 'swing_high', price: s.price });
  }
  if (swingLows.length > 0) {
    const s = swingLows[swingLows.length - 1];
    levels.push({ name: 'swing_low', price: s.price });
  }
  if (pdh) levels.push({ name: 'PDH', price: pdh });
  if (pdl) levels.push({ name: 'PDL', price: pdl });
  for (const r of roundLevels || []) levels.push({ name: 'round', price: r });
  for (const lv of levels) {
    if (Math.abs(close - lv.price) < tol) {
      if (direction === 'long' &&
          (lv.name === 'swing_low' || lv.name === 'PDL' || lv.name === 'round')) {
        return { near: true, level: lv.name, price: lv.price };
      }
      if (direction === 'short' &&
          (lv.name === 'swing_high' || lv.name === 'PDH' || lv.name === 'round')) {
        return { near: true, level: lv.name, price: lv.price };
      }
    }
  }
  return { near: false, level: null, price: null };
}

export function combineScores(results) {
  let longScore = 0;
  let shortScore = 0;
  const longReasons = [];
  const shortReasons = [];
  for (const r of results) {
    if (!r.fires) continue;
    if (r.direction === 'long') {
      longScore += r.weight;
      longReasons.push(r.reason);
    } else if (r.direction === 'short') {
      shortScore += r.weight;
      shortReasons.push(r.reason);
    }
  }
  if (longScore === 0 && shortScore === 0) return null;
  if (longScore >= shortScore) {
    return { direction: 'long', score: longScore, reasons: longReasons };
  }
  return { direction: 'short', score: shortScore, reasons: shortReasons };
                              }
