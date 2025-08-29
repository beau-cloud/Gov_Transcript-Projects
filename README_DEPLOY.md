# Gov Transcripts — GitHub Pages Deploy Bundle

This zip contains:
- `index.html` — deploy-ready build (real YouTube search + demo transcripts)
- `diagnostics.html` — tests your API key + referrer from your live origin
- `README_DEPLOY.md` — these instructions

## Quick Deploy (GitHub Desktop)
1) Drag **index.html** and **diagnostics.html** into your repo root.
2) Commit: "Deploy site" → Push origin.
3) GitHub → Repo → **Settings → Pages**:
   - Source: *Deploy from a branch*
   - Branch: `main`, Folder: `/ (root)` → Save
4) Open: https://beau-cloud.github.io/Gov_Transcript-Projects/?v=1  (Increment `v` to bust cache.)

## API Key Restrictions (Google Cloud → APIs & Services → Credentials → your key)
- Application restrictions: **HTTP referrers (web sites)**
- Website restrictions (add each on its own line):
  - `https://beau-cloud.github.io/`
  - `https://beau-cloud.github.io/*`
  - `https://beau-cloud.github.io/Gov_Transcript-Projects/*`
- API restrictions: **YouTube Data API v3**
- Save.

## Live Troubleshooting
- Badge at bottom-right should say **"Real Videos + Demo Transcripts"**.
- If search fails: open **diagnostics.html** in your live site and press **Run Search Test**.
  - 403 = referrer mismatch → adjust Website restrictions to match the origin it prints.
  - 200 + JSON = key OK.

## Local Testing (optional)
Serve files with a local server (not file://):
- Python: `python3 -m http.server 5500` → `http://localhost:5500/`
- Node: `npx serve`
Add these to Website restrictions if testing locally:
- `http://localhost/*`
- `http://127.0.0.1/*`

---
Bundle generated 2025-08-29T00:46:48.145911Z.