// /api/transcript.js (Vercel, Node runtime)
const { YoutubeTranscript } = require('youtube-transcript');

function toStamp(sec){
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = Math.floor(sec%60);
  return (h>0? h+':' : '') + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = String(req.query.id || '');
  const lang = String(req.query.lang || 'en');
  if (!id) return res.status(400).json({ success:false, error:'Missing id' });

  try {
    const segments = await YoutubeTranscript.fetchTranscript(id, { lang });
    return res.status(200).json({ success:true, segments });
  } catch (e) {
    return res.status(500).json({ success:false, error: e.message || String(e) });
  }
};

