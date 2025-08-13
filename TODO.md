# TODO

## Core Functionality
- [ ] Expose reasons in catalog entries (e.g. append to description)
- [ ] Provide clickable search/redirect for unresolved `ai:` pseudo IDs
- [ ] Add stream handler fallback (search Cinemeta / external sources) for AI-only IDs
- [ ] Add language parameter & detect user locale (pass to prompt)
- [ ] Optionally allow model selection (Gemini Flash, Pro)
- [ ] Add OpenAI / other provider fallback

## Caching & Performance
- [ ] Replace in-memory cache with Redis (optional env toggle)
- [ ] Pre-warm cache for a curated top N titles list
- [ ] Add per-key rate limiting to avoid quota exhaustion

## Quality & Matching
- [ ] Add TMDB genre + keyword enrichment to prompt
- [ ] Re-rank using simple semantic scoring (e.g. overlapping genres + year proximity)
- [ ] Deduplicate across localized titles

## Observability
- [ ] Add `/health` endpoint returning uptime + cache stats
- [ ] Add structured logging (pino) with log level env var
- [ ] Capture Gemini latency metrics

## Testing
- [ ] Unit tests for `buildPrompt()`
- [ ] Unit tests for `parseSimilarJSON()` (fenced, malformed, array forms)
- [ ] Integration test mocking Gemini API
- [ ] Snapshot test for manifest size (<8KB)

## Security
- [ ] Validate config inputs (max bounds, key length)
- [ ] Add optional API key hashing if ever persisted
- [ ] Implement simple abuse detection (excessive per-IP requests)

## UI / UX
- [ ] Root landing page explaining usage & providing config generator
- [ ] Show model + remaining quota estimate (if available)
- [ ] Dark / light theme toggle
- [ ] Add copy button for raw manifest URL with masked key

## Deployment
- [ ] Dockerfile with multi-stage build
- [ ] GitHub Action for lint + test + publish
- [ ] Version bump script / changelog generation

## Documentation
- [ ] Add architecture diagram (flow: Stremio -> meta -> Gemini -> mapping)
- [ ] FAQ section in README
- [ ] Add contribution guidelines

## Future Ideas
- [ ] Personalized recommendations (user watch history vectorization)
- [ ] Episode-level similarity
- [ ] Multi-model ensemble (Gemini + local embedding model)
