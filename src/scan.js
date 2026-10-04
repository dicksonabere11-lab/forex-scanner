// scan.js
// Main scanner.

import { ema, rsi, atr, bollinger, kaufmanER, atrPercentile } from './indicators.js';
import { findPivotHighs, findPivotLows, classifyStructure, roundNumberLevels } from './structure.js';
import {
  trendPullback, breakOfStructure, maCrossover, retestOfBrokenLevel,
  detectTrigger, nearSupportResistance, combineScores,
} from './strategies.js';
import { fetchCandles, fetchPreviousDayHL } from './data.js';
import {
  getInstruments, getSettings, getActiveSignals, getRecentSignal,
  saveSignal, updateSignal, logScan, finishScan, isUserActive,
} from './supabase.js';
import { sendSignalEmail } from './email.js';
import { explainSignal } from './ai.js';

const TIMEFRAME = '1h';
const CANDLE_COUNT = 300;
const COOLDOWN_MINUTES = 240;
const HIGH_THRESHOLD = 70;
const WATCH_THRESHOLD = 65;

function parseMode() {
  const arg = process.argv.find(a => a.startsWith('--mode='));
  if (!arg) return 'slow';
  return arg.split('=')[1] || 'slow';
}

function isWeekend() {
  const day = new Date().getUTCDay();
  if (day === 6) return true;
  if (day === 0 && new Date().getUTCHours() < 22) return true;
  return false;
}

function sessionScore() {
  const h = new Date().getUTCHours();
  if (h >= 13 && h < 16) return 1.0;
  if (h >= 8 && h < 21) return 0.8;
  return 0.5;
}

function passesGate({ structure, er, atrPct }) {
  if (structure === 'unclear' || structure === 'ranging') {
    return { pass: false, reason: 'structure unclear/ranging' };
  }
  if (er != null && er < 0.30) {
    return { pass: false, reason: `ER too low (${er.toFixed(2)})` };
  }
  if (atrPct != null && atrPct < 0.10) {
    return { pass: false, reason: 'volatility too low' };
  }
  if (atrPct != null && atrPct > 0.95) {
    return { pass: false, reason: 'volatility too high' };
  }
  return { pass: true, reason: null };
}

async function scanInstrument(instrument, settings, mode) {
  const apiKey = process.env.TWELVE_DATA_KEY;
  const symbol = instrument.data_symbol;
  const { candles } = await fetchCandles(symbol, TIMEFRAME, apiKey, CANDLE_COUNT);
  if (candles.length < 210) {
    return { skipped: true, reason: `not enough candles (${candles.length})` };
  }
  const closes = candles.map(c => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const bb = bollinger(closes, 20, 2);
  const er = kaufmanER(closes, 20);
  const atrPct = atrPercentile(atr14, 100);
  const swingHighs = findPivotHighs(candles, 3);
  const swingLows = findPivotLows(candles, 3);
  const structure = classifyStructure(swingHighs, swingLows, 4);
  const gate = passesGate({ structure, er, atrPct });
  if (!gate.pass) {
    return { skipped: true, reason: gate.reason };
  }
  let pdh = null, pdl = null;
  try {
    const hl = await fetchPreviousDayHL(symbol, apiKey);
    pdh = hl.pdh; pdl = hl.pdl;
  } catch (e) { /* non-fatal */ }
  const lastClose = closes[closes.length - 1];
  const roundLevels = roundNumberLevels(lastClose, instrument.pip_size);
  const ctx = {
    candles, ema20, ema50, ema200, rsi14, atr14, bb,
    structure, swingHighs, swingLows, pdh, pdl, roundLevels,
  };
  const results = [
    trendPullback(ctx),
    breakOfStructure(ctx),
    maCrossover(ctx),
    retestOfBrokenLevel(ctx),
  ];
  const combo = combineScores(results);
  if (!combo) {
    return { skipped: true, reason: 'no strategies fired' };
  }
  const trigger = detectTrigger(candles);
  if (!trigger.present || trigger.direction !== combo.direction) {
    return { skipped: true, reason: `trigger mismatch (${trigger.type || 'none'})` };
  }
  const loc = nearSupportResistance(ctx, combo.direction);
  if (!loc.near) {
    return { skipped: true, reason: 'not near S/R' };
  }
  const sess = sessionScore();
  const weightedScore = Math.round(combo.score * sess);
  if (weightedScore < WATCH_THRESHOLD) {
    return { skipped: true, reason: `score too low after session weight (${weightedScore})` };
  }
  const recent = await getRecentSignal(symbol, COOLDOWN_MINUTES);
  if (recent) {
    return { skipped: true, reason: 'cooldown active' };
  }
  const entry = lastClose;
  const atrNow = atr14[atr14.length - 1];
  const slMult = instrument.atr_sl_multiplier || 1.5;
  const tpMult = instrument.atr_tp_multiplier || 3.0;
  let stop, target;
  if (combo.direction === 'long') {
    stop = entry - slMult * atrNow;
    target = entry + tpMult * atrNow;
  } else {
    stop = entry + slMult * atrNow;
    target = entry - tpMult * atrNow;
  }
  const tier = weightedScore >= HIGH_THRESHOLD ? 'high' : 'watch';
  const record = {
    instrument_id: instrument.id,
    symbol: instrument.symbol,
    direction: combo.direction,
    timeframe: TIMEFRAME,
    entry_price: parseFloat(entry.toFixed(6)),
    stop_loss: parseFloat(stop.toFixed(6)),
    take_profit: parseFloat(target.toFixed(6)),
    atr_at_creation: parseFloat(atrNow.toFixed(6)),
    confidence_score: weightedScore,
    score_breakdown: {
      raw_score: combo.score,
      session_multiplier: sess,
      reasons: combo.reasons,
      trigger: trigger.type,
      location: loc.level,
      structure,
      er: er != null ? parseFloat(er.toFixed(3)) : null,
    },
    rationale: combo.reasons.join(' · '),
    status: 'active',
  };
  const saved = await saveSignal(record);
  if (tier === 'high') {
    try {
      const explanation = await explainSignal(saved);
      if (explanation) {
        await updateSignal(saved.id, { rationale: explanation });
        saved.rationale = explanation;
      }
    } catch (e) {
      console.error('explain failed:', e.message);
    }
    try {
      await sendSignalEmail(saved, saved.rationale);
    } catch (e) {
      console.error('email failed:', e.message);
    }
  }
  return {
    fired: true,
    tier,
    symbol: instrument.symbol,
    direction: combo.direction,
    score: weightedScore,
  };
}

async function checkOpenSignals(instruments) {
  const active = await getActiveSignals();
  const apiKey = process.env.TWELVE_DATA_KEY;
  let closed = 0;
  for (const sig of active) {
    const inst = instruments.find(i => i.symbol === sig.symbol);
    if (!inst) continue;
    let candles;
    try {
      const res = await fetchCandles(inst.data_symbol, TIMEFRAME, apiKey, 20);
      candles = res.candles;
    } catch (e) {
      console.error('candle fetch failed:', e.message);
      continue;
    }
    const recent = candles.slice(-5);
    let exitPrice = null;
    for (const c of recent) {
      if (sig.direction === 'long') {
        if (c.low <= sig.stop_loss) { exitPrice = sig.stop_loss; break; }
        if (c.high >= sig.take_profit) { exitPrice = sig.take_profit; break; }
      } else {
        if (c.high >= sig.stop_loss) { exitPrice = sig.stop_loss; break; }
        if (c.low <= sig.take_profit) { exitPrice = sig.take_profit; break; }
      }
    }
    if (exitPrice != null) {
      await updateSignal(sig.id, {
        status: 'closed',
        exit_price: exitPrice,
      });
      closed++;
    }
  }
  return closed;
}

async function main() {
  const mode = parseMode();
  console.log(`[scan] mode=${mode} at ${new Date().toISOString()}`);
  if  (isWeekend() && !process.argv.includes('--force')) {
    console.log('[scan] weekend — skipping');
    return;
  }
  if (mode === 'fast') {
    const active = await isUserActive(15);
    if (!active) {
      console.log('[scan] user inactive — skipping fast');
      return;
    }
  }
  const instruments = await getInstruments();
  const settings = await getSettings();
  if (!instruments || instruments.length === 0) {
    console.log('[scan] no instruments');
    return;
  }
  const scanLog = await logScan({ timeframe: TIMEFRAME, status: 'running' });
  let signalsCreated = 0;
  let skipped = 0;
  const errors = [];
  for (const inst of instruments) {
    try {
      const r = await scanInstrument(inst, settings, mode);
      if (r.fired) {
        signalsCreated++;
        console.log(`[fire] ${r.symbol} ${r.direction} score=${r.score} tier=${r.tier}`);
      } else {
        skipped++;
        console.log(`[skip] ${inst.symbol}: ${r.reason}`);
      }
    } catch (e) {
      errors.push(`${inst.symbol}: ${e.message}`);
      console.error(`[error] ${inst.symbol}: ${e.message}`);
    }
  }
  let closed = 0;
  try {
    closed = await checkOpenSignals(instruments);
  } catch (e) {
    errors.push(`close-check: ${e.message}`);
  }
  if (scanLog) {
    await finishScan(scanLog.id, {
      instruments_scanned: instruments.length,
      signals_created: signalsCreated,
      errors: errors.length ? errors.join(' | ') : null,
    });
  }
  console.log(`[scan] done — fired ${signalsCreated}, skipped ${skipped}, closed ${closed}`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
