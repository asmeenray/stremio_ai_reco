# AI Similar Titles Stremio Add-on

Gemini (Google Generative AI) powered similar movie / series recommendations delivered as a Stremio add-on. Adds a dedicated Similar catalog per title and enriches meta with `aiSimilar`.

## Key Features
- On-demand AI recommendations (Gemini) for any movie or series (IMDb id based).
- Optional TMDB API key to improve title -> IMDb ID resolution.
- Cached results (in-memory) with configurable TTL.
- Native Stremio configuration form (geminiKey, tmdbKey, ttl, max).
- Fallback catalog endpoint: `catalog/<type>/similar:<imdbId>.json` so recommendations show as a selectable tab (like other providers) when available.

## Manifest Config Fields
| Key | Required | Description |
| --- | --- | --- |
| geminiKey | yes | Google Gemini API key (server does not persist it) |
| tmdbKey | no | TMDB v4 Read Token (Bearer) for better matching |
| ttl | no (21600) | Cache TTL seconds |
| max | no (8) | Max similar results (1-12) |

## Environment Variables (development convenience)
```
GEMINI_API_KEY=your_gemini_key   # optional if you will configure in-app
TMDB_API_KEY=your_tmdb_v4_token  # optional
PORT=7000
CACHE_TTL_SECONDS=21600
```

## Install & Run Locally
```
npm install
npm start
```
Visit `http://localhost:7000/manifest.json` or just add the URL inside Stremio via Add-ons -> Install via URL.

When prompted, fill the config fields (Gemini key mandatory). After install, open a movie/series detail and pick the provider tab named `similar` (Stremio groups catalogs by id prefix). If the UI does not automatically show the tab, you can access the raw catalog:
```
http://localhost:7000/catalog/movie/similar:tt0133093.json
```
Replace `movie` with `series` for shows.

## How Recommendation Flow Works
1. User opens a title in Stremio -> Stremio calls add-on meta endpoint.
2. Add-on retrieves Cinemeta base info for grounding (title, year, genres, plot).
3. Builds structured prompt and queries Gemini for up to `max` similar candidates.
4. Parses JSON from Gemini, then attempts to resolve each candidate to a valid meta via Cinemeta search; if not found and TMDB key present, uses TMDB search + external_ids to get IMDb id.
5. Returns enriched meta with `aiSimilar` array AND exposes the same list through `catalog/<type>/similar:<imdbId>.json` for a tab.

## Important Notes
- All caching is in-memory; restart clears it.
- Gemini output occasionally wraps in markdown code fences; parser strips them.
- If a recommendation cannot be matched to a known id, an artificial id `ai:<title>` is emitted (Stremio cannot stream it; future enhancement: link to search).

## Roadmap / TODO
- [ ] Persist cache (Redis or file) to survive restarts.
- [ ] Add embeddings re-rank (TMDB genres + Gemini reason weighting).
- [ ] Provide stream handler for unmatched AI titles via best-effort search.
- [ ] Add language/locale awareness (pass user preferred language in prompt).
- [ ] Add rate limiting / request queue.
- [ ] Add health endpoint `/health`.
- [ ] Add tests (prompt builder, parser, mapping).
- [ ] Add optional OpenAI model fallback.
- [ ] UI: surface reasons in catalog description.
- [ ] Add CLI script to pre-warm cache for popular titles.

## Development Tips
- Lower cache TTL for iterative testing: set `ttl` config to 60.
- Use `curl` for quick inspection:
  ```bash
  curl http://localhost:7000/meta/movie/tt0133093.json | jq '.meta.aiSimilar'
  curl http://localhost:7000/catalog/movie/similar:tt0133093.json | jq '.metas[].name'
  ```
- Add `console.log(prompt)` temporarily in `geminiClient.js` if tuning prompt.

## Production Deployment
- Host on any Node-compatible platform (Railway, Render, Fly.io).
- Set environment secrets instead of hard-coding keys.
- Optionally run behind a reverse proxy with rate limiting.

## Disclaimer
Gemini results may contain inaccuracies; always validate before relying on them.
