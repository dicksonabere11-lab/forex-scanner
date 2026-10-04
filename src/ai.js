// ai.js
// Groq API — explains signals and writes summaries.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

async function askGroq(systemPrompt, userPrompt, maxTokens = 300) {
  const key = process.env.GROQ_KEY;
  if (!key) throw new Error('Missing GROQ_KEY');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned no content');
  return text.trim();
}

const EXPLAIN_SYSTEM = `You are a forex analyst writing short, clear signal explanations for a personal trading tool.
Rules:
- Write 100 to 140 words.
- Plain English. Avoid jargon unless necessary.
- Explain what the market is doing, why the setup appeared, and how the stop and target relate to the entry.
- Do NOT give trading advice or tell the user to buy or sell.
- Do NOT include headings, bullet points, or lists. Just a short paragraph.
- Do NOT mention AI, models, or that you are an AI.`;

export async function explainSignal(signal) {
  const parts = [];
  parts.push(`Symbol: ${signal.symbol}`);
  parts.push(`Direction: ${signal.direction.toUpperCase()}`);
  parts.push(`Timeframe: ${signal.timeframe}`);
  parts.push(`Entry: ${signal.entry_price}`);
  parts.push(`Stop loss: ${signal.stop_loss}`);
  parts.push(`Take profit: ${signal.take_profit}`);
  parts.push(`Confidence score: ${signal.confidence_score} out of 100`);
  if (signal.score_breakdown) {
    try {
      const bd = typeof signal.score_breakdown === 'string'
        ? JSON.parse(signal.score_breakdown)
        : signal.score_breakdown;
      const list = Object.entries(bd)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (list) parts.push(`Score breakdown: ${list}`);
    } catch (e) { /* ignore */ }
  }
  if (signal.rationale) parts.push(`Engine notes: ${signal.rationale}`);
  const userPrompt = `Explain this forex signal in about 100 to 140 words of plain English:\n\n${parts.join('\n')}`;
  try {
    return await askGroq(EXPLAIN_SYSTEM, userPrompt, 300);
  } catch (e) {
    console.error('explainSignal failed:', e.message);
    return null;
  }
}

const SUMMARY_SYSTEM = `You are a forex analyst writing short summaries of recent trading signals for a personal tool.
Rules:
- Keep it under 180 words.
- Plain English. No jargon unless necessary.
- Report what happened, not what should happen next.
- Do NOT give trading advice.
- Do NOT use headings, bullet lists, or markdown.
- Do NOT mention AI or that you are an AI.`;

export async function summarizePeriod(periodLabel, signals) {
  if (!signals || signals.length === 0) {
    return `No signals were fired during this ${periodLabel}.`;
  }
  const lines = signals.map(s => {
    let line = `${s.symbol} ${s.direction.toUpperCase()} · score ${s.confidence_score} · status ${s.status}`;
    if (s.outcome) line += ` · outcome ${s.outcome}`;
    if (s.r_multiple != null) line += ` · ${s.r_multiple.toFixed(2)}R`;
    return line;
  });
  const userPrompt =
    `Write a short summary of these signals from the ${periodLabel}. ` +
    `Mention the total count, how many won or lost, and note anything worth observing. ` +
    `Signals:\n\n${lines.join('\n')}`;
  try {
    return await askGroq(SUMMARY_SYSTEM, userPrompt, 400);
  } catch (e) {
    console.error('summarizePeriod failed:', e.message);
    return null;
  }
}
