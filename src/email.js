// email.js
// Sends emails via Resend.

const RESEND_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html, from }) {
  const key = process.env.RESEND_KEY;
  if (!key) throw new Error('Missing RESEND_KEY');
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: from || "Dao's FX Wizard <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${res.status} ${body}`);
  }
  return res.json();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;',
  }[m]));
}

function fmtPrice(n) {
  if (n == null) return '-';
  const num = parseFloat(n);
  if (num >= 100) return num.toFixed(2);
  if (num >= 10) return num.toFixed(3);
  return num.toFixed(5);
}

export async function sendSignalEmail(signal, explanation) {
  const to = process.env.MY_EMAIL;
  if (!to) throw new Error('Missing MY_EMAIL');
  const dirColor = signal.direction === 'long' ? '#3fb950' : '#f85149';
  const dirLabel = signal.direction === 'long' ? 'LONG' : 'SHORT';
  const scoreColor = signal.confidence_score >= 80 ? '#3fb950' : '#d29922';
  const html = `
  <div style="font-family:-apple-system,system-ui,sans-serif;background:#0e1117;color:#e6edf3;padding:24px;border-radius:10px;max-width:520px;margin:0 auto;">
    <div style="font-size:13px;color:#8b949e;margin-bottom:8px;">New Signal · Dao's FX Wizard</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h1 style="margin:0;font-size:22px;">${esc(signal.symbol)}</h1>
      <span style="color:${dirColor};font-weight:700;font-size:14px;">${dirLabel}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="background:#161b22;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:#8b949e;text-transform:uppercase;margin-bottom:3px;">Entry</div>
        <div style="font-size:15px;font-weight:600;">${fmtPrice(signal.entry_price)}</div>
      </div>
      <div style="background:#161b22;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:#8b949e;text-transform:uppercase;margin-bottom:3px;">Stop</div>
        <div style="font-size:15px;font-weight:600;color:#f85149;">${fmtPrice(signal.stop_loss)}</div>
      </div>
      <div style="background:#161b22;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:#8b949e;text-transform:uppercase;margin-bottom:3px;">Target</div>
        <div style="font-size:15px;font-weight:600;color:#3fb950;">${fmtPrice(signal.take_profit)}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#8b949e;margin-bottom:16px;">
      <span style="color:${scoreColor};font-weight:700;">Score ${signal.confidence_score}</span>
      <span>${esc(signal.timeframe || '')}</span>
    </div>
    ${explanation ? `
    <div style="background:#161b22;padding:14px;border-radius:8px;font-size:14px;line-height:1.55;color:#e6edf3;">
      ${esc(explanation)}
    </div>` : ''}
    <div style="font-size:11px;color:#8b949e;margin-top:18px;text-align:center;">
      Dao's FX Wizard
    </div>
  </div>
  `;
  return sendEmail({
    to,
    subject: `New Signal — ${signal.symbol} ${signal.direction.toUpperCase()}`,
    html,
  });
}

export async function sendDigestEmail(subject, body) {
  const to = process.env.MY_EMAIL;
  if (!to) throw new Error('Missing MY_EMAIL');
  const html = `
  <div style="font-family:-apple-system,system-ui,sans-serif;background:#0e1117;color:#e6edf3;padding:24px;border-radius:10px;max-width:520px;margin:0 auto;">
    <div style="font-size:13px;color:#8b949e;margin-bottom:12px;">Dao's FX Wizard</div>
    <h1 style="margin:0 0 16px;font-size:20px;">${esc(subject)}</h1>
    <div style="background:#161b22;padding:16px;border-radius:8px;font-size:14px;line-height:1.6;white-space:pre-wrap;">
      ${esc(body)}
    </div>
    <div style="font-size:11px;color:#8b949e;margin-top:18px;text-align:center;">
      Dao's FX Wizard
    </div>
  </div>
  `;
  return sendEmail({ to, subject, html });
        }
