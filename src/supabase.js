// supabase.js
// All database operations.

import { createClient } from '@supabase/supabase-js';

let client = null;

export function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function getInstruments() {
  const sb = getClient();
  const { data, error } = await sb
    .from('instruments')
    .select('*')
    .eq('active', true);
  if (error) throw new Error('getInstruments: ' + error.message);
  return data || [];
}

export async function getSettings() {
  const sb = getClient();
  const { data, error } = await sb
    .from('settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error('getSettings: ' + error.message);
  return data;
}

export async function getActiveSignals() {
  const sb = getClient();
  const { data, error } = await sb
    .from('signals')
    .select('*')
    .eq('status', 'active');
  if (error) throw new Error('getActiveSignals: ' + error.message);
  return data || [];
}

export async function getRecentSignal(symbol, withinMinutes) {
  const sb = getClient();
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('signals')
    .select('id, created_at, status')
    .eq('symbol', symbol)
    .gte('created_at', since)
    .limit(1);
  if (error) throw new Error('getRecentSignal: ' + error.message);
  return data && data.length > 0 ? data[0] : null;
}

export async function saveSignal(signal) {
  const sb = getClient();
  const { data, error } = await sb
    .from('signals')
    .insert(signal)
    .select()
    .single();
  if (error) throw new Error('saveSignal: ' + error.message);
  return data;
}

export async function updateSignal(id, updates) {
  const sb = getClient();
  const { data, error } = await sb
    .from('signals')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error('updateSignal: ' + error.message);
  return data;
}

export async function logScan(entry) {
  const sb = getClient();
  const { data, error } = await sb.from('scans').insert(entry).select().single();
  if (error) console.error('logScan failed:', error.message);
  return data;
}

export async function finishScan(id, updates) {
  const sb = getClient();
  const { error } = await sb
    .from('scans')
    .update({ finished_at: new Date().toISOString(), status: 'done', ...updates })
    .eq('id', id);
  if (error) console.error('finishScan failed:', error.message);
}

export async function isUserActive(windowMinutes = 15) {
  const sb = getClient();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('user_activity')
    .select('last_seen')
    .order('last_seen', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return false;
  if (!data || !data.last_seen) return false;
  return new Date(data.last_seen).toISOString() >= since;
}
