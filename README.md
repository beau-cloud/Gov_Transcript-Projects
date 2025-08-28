# Open Source Government Transcripts — GitHub Pages Bundle

This folder is prepped for **GitHub Pages**. It includes:
- `index.html` (renamed from `Index.html` — many servers are case-sensitive)
- `404.html` (fallback so deep links still load the app)
- `.nojekyll` (prevents GitHub Pages from running Jekyll over your files)

## Publish with GitHub Desktop (no terminal)
1. Open **GitHub Desktop** → **File → Create a New Repository…**
2. Set **Local path** to this folder (`osgt_site`) and **Create Repository**.
3. In the bottom-left, type a **Summary** like `Initial commit` → **Commit to main**.
4. Click **Publish repository** (top bar) → choose **Public** (or Private).
5. On GitHub.com, open the repo → **Settings** → **Pages** → **Branch: main** and **/(root)** → **Save**.
6. Wait ~1–2 minutes. Your site will appear at:
   - `https://YOUR-USERNAME.github.io/YOUR-REPO/`

### Notes
- Your app references third‑party scripts (CDNs) and a placeholder `YOUTUBE_API_KEY` inside `index.html`.
  - Without a real key (or a serverless proxy), transcript fetching will show demo data.
- If you later add folders (assets, images, scripts), keep paths **relative** (e.g., `./assets/file.js`).
