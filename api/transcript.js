// /api/transcript.js
// Dual-path transcript fetcher for Vercel (Node serverless).
// Path "library" = youtube-transcript; path "watchpage" = direct caption track fetch.
// Returns: { success, segments?, path?, language?, kind?, reason?, debug? }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const { id: rawId, url: rawUrl, lang = '', debug = '' } = req.query || {};
    const videoId = extractVideoId(rawId || rawUrl);
    if (!videoId) {
      return json(res, 400, { success: false, reason: 'missing_or_bad_id' });
    }

    const wantDebug = debug == '1';
    const requestedLangs = normalizeLangs(lang);
    const tryLangs = requestedLangs.length
      ? requestedLangs
      : ['en', 'en-US', 'en-GB', 'es', 'fr', 'de'];

    // 1) Try library first (if available)
    let libErr = null;
    try {
      const mod = await import('youtube-transcript').catch(() => null);
      const YoutubeTranscript =
        mod && (mod.YoutubeTranscript || (mod.default && mod.default.YoutubeTranscript));
      if (YoutubeTranscript) {
        for (const L of tryLangs) {
          try {
            const arr = await YoutubeTranscript.fetchTranscript(videoId, { lang: L });
            if (Array.isArray(arr) && arr.length) {
              const segments = arr
                .map((s) => toSegmentFromLibrary(s))
                .filter((s) => s && s.text.trim().length);
              if (segments.length) {
                return json(res, 200, {
                  success: true,
                  segments,
                  path: 'library',
                  language: L,
                  kind: 'unknown',
                  ...(wantDebug ? { debug: { triedLangs: tryLangs, lib: 'hit' } } : {}),
                });
              }
            }
          } catch (e) {
            // keep trying other langs
            libErr = e && (e.message || String(e));
          }
        }
      } else {
        libErr = 'library_not_loaded';
      }
    } catch (e) {
      libErr = e && (e.message || String(e));
    }

    // 2) Fallback: scrape watch page -> captionTracks -> fetch JSON3
    const wp = await fetchWatchPage(videoId);
    if (wp.error) {
      // upstream block/403/etc
      return json(res, 200, {
        success: false,
        reason: 'blocked_upstream',
        ...(wantDebug ? { debug: { libErr, upstream: wp.error } } : {}),
      });
    }

    const { tracks, details } = wp;
    if (!tracks || !tracks.length) {
      return json(res, 200, {
        success: false,
        reason: 'no_captions',
        ...(wantDebug ? { debug: { libErr, note: 'no captionTracks' } } : {}),
      });
    }

    // Prefer requested languages, then English, then first available
    const pick = pickTrack(tracks, tryLangs);
    if (!pick) {
      return json(res, 200, {
        success: false,
        reason: 'no_captions', // present but none match—treat as not usable
        ...(wantDebug ? { debug: { libErr, available: tracks.map(t => t.languageCode) } } : {}),
      });
    }

    // Ensure JSON3
    const json3Url = pick.baseUrl.includes('fmt=')
      ? pick.baseUrl
      : pick.baseUrl + (pick.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';

    const capRes = await fetch(json3Url, {
      headers: ytHeaders(),
    });
    if (!capRes.ok) {
      return json(res, 200, {
        success: false,
        reason: capRes.status === 404 ? 'no_captions' : 'blocked_upstream',
        ...(wantDebug ? { debug: { status: capRes.status, libErr } } : {}),
      });
    }
    const capJson = await capRes.json().catch(() => null);
    const segments = toSegmentsFromJson3(capJson);
    if (!segments.length) {
      return json(res, 200, {
        success: false,
        reason: 'no_captions',
        ...(wantDebug ? { debug: { libErr, note: 'empty events' } } : {}),
      });
    }

    return json(res, 200, {
      success: true,
      segments,
      path: 'watchpage',
      language: pick.languageCode || 'unknown',
      kind: pick.kind || (pick.vssId && pick.vssId.startsWith('a.')) ? 'asr' : 'manual',
      ...(wantDebug
        ? {
            debug: {
              libErr,
              triedLangs: tryLangs,
              selectedTrack: {
                languageCode: pick.languageCode,
                kind: pick.kind,
                name: pick.name && pick.name.simpleText,
              },
              videoDetails: { title: details && details.title },
            },
          }
        : {}),
    });
  } catch (err) {
    return json(res, 200, {
      success: false,
      reason: 'unexpected_error',
      error: String(err && err.message ? err.message : err),
    });
  }
};

// ---------- helpers ----------

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();

  // If it's a bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  // Try parse URL
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      // Shorts or other formats won’t have captions usually, but try path last segment
      const parts = u.pathname.split('/').filter(Boolean);
      const maybe = parts[parts.length - 1];
      if (maybe && /^[a-zA-Z0-9_-]{11}$/.test(maybe)) return maybe;
    }
  } catch (_) {}
  return null;
}

function normalizeLangs(l) {
  if (!l) return [];
  return String(l)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function toSegmentFromLibrary(s) {
  // library returns: { text, duration, offset } (seconds)
  if (!s || typeof s.text !== 'string') return null;
  const start = Number(s.offset || 0);
  const dur = Number(s.duration || 0);
  return {
    start: isFinite(start) ? start : 0,
    dur: isFinite(dur) ? dur : 0,
    text: s.text.replace(/\s+/g, ' ').trim(),
  };
}

function toSegmentsFromJson3(json) {
  const events = json && Array.isArray(json.events) ? json.events : [];
  const out = [];
  for (const ev of events) {
    if (!ev) continue;
    const t = (ev.segs || []).map((sg) => (sg.utf8 || '')).join('');
    const text = (t || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = (ev.tStartMs || 0) / 1000;
    const dur = (ev.dDurationMs || ev.durMs || 0) / 1000;
    out.push({
      start: isFinite(start) ? start : 0,
      dur: isFinite(dur) ? dur : 0,
      text,
    });
  }
  // Ensure sorted
  out.sort((a, b) => a.start - b.start);
  return out;
}

function pickTrack(tracks, langs) {
  // Prefer non-ASR in requested language; then non-ASR English; then any match; then first.
  const langSet = new Set(langs.map((x) => x.toLowerCase()));
  const isMatch = (t) => langSet.size === 0 || langSet.has(String(t.languageCode || '').toLowerCase());
  const nonAsr = tracks.filter((t) => (t.kind || '') !== 'asr');
  const asr = tracks.filter((t) => (t.kind || '') === 'asr');

  // requested language, non-ASR
  let pick = nonAsr.find(isMatch);
  if (pick) return pick;

  // requested language, ASR
  pick = asr.find(isMatch);
  if (pick) return pick;

  // english non-ASR
  pick = nonAsr.find((t) => String(t.languageCode).toLowerCase().startsWith('en'));
  if (pick) return pick;

  // english ASR
  pick = asr.find((t) => String(t.languageCode).toLowerCase().startsWith('en'));
  if (pick) return pick;

  // anything
  return tracks[0];
}

async function fetchWatchPage(videoId) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`;
  const resp = await fetch(url, { headers: ytHeaders() }).catch((e) => ({ ok: false, statusText: String(e) }));
  if (!resp || !resp.ok) {
    return { error: `watchpage_fetch_failed:${resp && resp.status}` };
  }
  const html = await resp.text();
  const m = html.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?})\s*;/);
  if (!m) return { error: 'player_response_not_found' };

  let player;
  try {
    player = JSON.parse(m[1]);
  } catch {
    return { error: 'player_response_parse_error' };
  }

  const details = player && player.videoDetails ? player.videoDetails : null;
  const list =
    player &&
    player.captions &&
    player.captions.playerCaptionsTracklistRenderer &&
    player.captions.playerCaptionsTracklistRenderer.captionTracks;

  const tracks = Array.isArray(list) ? list.map(slimTrack) : [];
  return { tracks, details };
}

function slimTrack(t) {
  return {
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    kind: t.kind, // 'asr' => auto
    name: t.name,
    vssId: t.vssId,
  };
}

function ytHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}
