// /api/transcript.js — robust language fallback + URL or ID support
const { YoutubeTranscript } = require('youtube-transcript');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const qId = (req.query.id || '').trim();
  const qUrl = (req.query.url || '').trim();
  const hintLang = String(req.query.lang || '').trim(); // hint only
  const debug = String(req.query.debug || '').trim().toLowerCase() in { '1':1, 'true':1 };

  const id = extractVideoId(qId || qUrl);
  if (!id) {
    return res.status(400).json({ success:false, error:'Missing or invalid video id/url' });
  }

  try {
    const { segments, used, tried, errors } = await fetchWithFallback(id, hintLang);
    const payload = { success: true, segments, lang: used };
    if (debug) { payload.tried = tried; payload.errors = errors; }
    return res.status(200).json(payload);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const noCaps = /Transcript is disabled|No transcript available/i.test(msg) || /No transcript found in tried languages/i.test(msg);
    const payload = { success:false, reason: noCaps ? 'no_captions' : 'error', error: msg };
    if (debug && e && e._debug) { payload.tried = e._debug.tried; payload.errors = e._debug.errors; }
    return res.status(noCaps ? 404 : 500).json(payload);
  }
};

function extractVideoId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const ID = /^[a-zA-Z0-9_-]{11}$/;
  if (ID.test(raw)) return raw; // direct ID

  // Try URL patterns
  try {
    const u = new URL(raw);
    const v = u.searchParams.get('v');
    if (v && ID.test(v)) return v;
    const p = u.pathname;
    const patterns = [
      /^\/([a-zA-Z0-9_-]{11})$/,         // youtu.be/<id>
      /^\/embed\/([a-zA-Z0-9_-]{11})/,  // /embed/<id>
      /^\/shorts\/([a-zA-Z0-9_-]{11})/, // /shorts/<id>
      /^\/live\/([a-zA-Z0-9_-]{11})/,   // /live/<id>
    ];
    for (const re of patterns) { const m = p.match(re); if (m) return m[1]; }
  } catch(_) {}
  const m = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  return null;
}

async function fetchWithFallback(id, hintLang) {
  // Order matters: user hint first, common English variants, then "auto" (no lang param).
  const candidates = [];
  if (hintLang && !/auto/i.test(hintLang)) candidates.push(hintLang);
  ['en', 'en-US', 'en-GB', 'en-CA', 'en-AU'].forEach(l => { if (!candidates.includes(l)) candidates.push(l); });
  // Try without specifying a language so the library auto-picks the default
  candidates.push(null);

  const tried = [];
  const errors = [];

  for (const lang of candidates) {
    tried.push(lang || 'auto');
    try {
      const segs = await YoutubeTranscript.fetchTranscript(id, lang ? { lang } : undefined);
      if (Array.isArray(segs) && segs.length) {
        return { segments: segs, used: lang || 'auto', tried, errors };
      }
    } catch (e) {
      errors.push({ lang: lang || 'auto', error: (e && e.message) || String(e) });
      // Continue trying other languages unless error clearly indicates captions are disabled
      const msg = (e && e.message) || '';
      if (/Transcript is disabled|No transcript available/i.test(msg)) {
        // Still try "auto" if we haven't yet, otherwise bail
        const hasAutoPending = candidates.includes(null) and (tried[tried.length-1] !== 'auto');
        if (!hasAutoPending) break;
      }
    }
  }
  const err = new Error('No transcript found in tried languages');
  err._debug = { tried, errors };
  throw err;
}
