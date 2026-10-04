// digest.js
// Daily and weekly summary emails.

import { getClient } from './supabase.js';
import { sendDigestEmail } from './email.js';
import { summarizePeriod } from './ai.js';

function parseType() {
  const arg = process.argv.find(a => a.startsWith('--type='));
  if (!arg) return 'daily';
  return arg.split('=')[1] || 'daily';
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchRecentSignals(sinceIso) {
  const sb = getClient();
  const { data, error } = await sb
    .from('signals')
    .select('*')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });
  if (error) throw new Error('fetchRecentSignals: ' + error.message);
  return data || [];
}

function computeStats(signals) {
  const closed = signals.filter(s => s.status === 'closed');
  const wins = closed.filter(s => s.outcome === 'win').length;
  const losses = closed.filter(s => s.outcome === 'loss').length;
  const bes = closed.filter(s => s.outcome === 'breakeven').length;
  const totalR = closed.reduce((sum, s) => sum + (s.r_multiple || 0), 0);
  const decided = wins + losses;
  const rate = decided > 0 ? Math.round((wins / decided) * 100) : null;
  return {
    total: signals.length,
    closed: closed.length,
    wins, losses, breakevens: bes,
    totalR: parseFloat(totalR.toFixed(2)),
    winRate: rate,
  };
}

async function main() {
  const type = parseType();
  const periodLabel = type === 'weekly' ? 'week' : 'day';
  const since = type === 'weekly' ? daysAgo(7) : daysAgo(1);
  console.log(`[digest] type=${type}`);
  const signals = await fetchRecentSignals(since);
  const stats = computeStats(signals);
  const aiSummary = await summarizePeriod(periodLabel, signals);
  const lines = [];
  lines.push(`Signals fired: ${stats.total}`);
  lines.push(`Closed: ${stats.closed}`);
  lines.push(`Wins: ${stats.wins} · Losses: ${stats.losses} · Breakeven: ${stats.breakevens}`);
  if (stats.winRate != null) {
    lines.push(`Success rate: ${stats.winRate}%`);
  } else {
    lines.push(`Success rate: not enough data yet`);
  }
  lines.push(`Total R: ${stats.totalR >= 0 ? '+' : ''}${stats.totalR}R`);
  if (aiSummary) {
    lines.push('');
    lines.push(aiSummary);
  }
  const subject = type === 'weekly'
    ? "Dao's FX Wizard — Weekly Summary"
    : "Dao's FX Wizard — Daily Summary";
  await sendDigestEmail(subject, lines.join('\n'));
  console.log('[digest] sent');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
