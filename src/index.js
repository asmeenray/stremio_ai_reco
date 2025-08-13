import 'dotenv/config';
import sdk from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = sdk;
import { fetchMeta, mapSimilarToMetas, searchTitle } from './cinemeta.js';
import { buildPrompt, getSimilarTitlesRaw, parseSimilarJSON } from './geminiClient.js';
import { cache, cacheKey } from './cache.js';

const manifest = {
  id: 'community.stremio.ai-similar',
  version: '0.2.1',
  name: 'AI Similar Titles',
  description: 'Gemini AI generated similar movies/series',
  logo: 'https://stremio-logo.s3.eu-central-1.amazonaws.com/stremio-icon.png',
  background: 'https://stremio-logo.s3.eu-central-1.amazonaws.com/hero-bg.png',
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'ai-similar', name: 'AI Similar (Gemini)', extra: [{ name: 'search', isRequired: true }, { name: 'max' }] },
    { type: 'series', id: 'ai-similar', name: 'AI Similar (Gemini)', extra: [{ name: 'search', isRequired: true }, { name: 'max' }] }
  ],
  resources: [ 'catalog', 'stream', 'meta' ],
  idPrefixes: ['tt'],
  behaviorHints: { configurable: true, configurationRequired: true },
  config: [
    { key: 'geminiKey', title: 'Gemini API Key', type: 'text', required: true },
    { key: 'tmdbKey', title: 'TMDB (optional, improves matching)', type: 'text' },
    { key: 'enableTitleSearch', title: 'Enable Title-Based Search (y:YYYY, t:movie|series flags)', type: 'boolean', default: false },
    { key: 'ttl', title: 'Cache TTL (seconds)', type: 'number', default: 21600 },
    { key: 'max', title: 'Max Similar Results (1-12)', type: 'number', default: 8 }
  ]
};

const builder = new addonBuilder(manifest);

function normalizeRuntimeConfig(extra = {}, cfg = {}) {
  const ttl = parseInt((extra.ttl || cfg.ttl || process.env.CACHE_TTL_SECONDS || '21600'), 10);
  const maxRaw = parseInt((extra.max || cfg.max || '8'), 10) || 8;
  if (cfg.tmdbKey && !process.env.TMDB_API_KEY) process.env.TMDB_API_KEY = cfg.tmdbKey;
  return {
    geminiKey: extra.geminiKey || cfg.geminiKey || process.env.GEMINI_API_KEY,
    ttl: isNaN(ttl) ? 21600 : ttl,
    max: Math.min(12, Math.max(1, maxRaw)),
    enableTitleSearch: (extra.enableTitleSearch ?? cfg.enableTitleSearch) === true || (extra.enableTitleSearch === 'true')
  };
}

async function computeSimilar(baseMeta, type, cfg){
  if (!cfg.geminiKey || !baseMeta) return [];
  const prompt = buildPrompt(baseMeta);
  let raw;
  try { raw = await getSimilarTitlesRaw(prompt, cfg.geminiKey); }
  catch (e) { if (/Gemini API error 5/.test(e.message)) return []; throw e; }
  const parsed = parseSimilarJSON(raw).slice(0, cfg.max);
  return mapSimilarToMetas(parsed, type);
}

// Meta handler simple
builder.defineMetaHandler(async ({ type, id }) => {
  try { const baseMeta = await fetchMeta(type, id); return { meta: baseMeta }; }
  catch (e) { console.error('Meta handler error', e); return { meta: { id, type, name: 'Unknown', description: 'Error fetching metadata' } }; }
});

function parseSearchKey(raw) {
  let searchKey = raw; let searchYear = null; let searchType = null;
  const yearMatch = searchKey.match(/\by:(\d{4})\b/i); if (yearMatch) { searchYear = yearMatch[1]; searchKey = searchKey.replace(/\by:\d{4}\b/i, '').trim(); }
  const typeMatch = searchKey.match(/\bt:(movie|series)\b/i); if (typeMatch) { searchType = typeMatch[1].toLowerCase(); searchKey = searchKey.replace(/\bt:(movie|series)\b/i, '').trim(); }
  return { searchKey, searchYear, searchType };
}

builder.defineCatalogHandler(async ({ type, id, extra, config }) => {
  if (id !== 'ai-similar') return { metas: [] };
  const cfg = normalizeRuntimeConfig(extra, config);
  const rawSearch = (extra?.search || '').trim();
  if (!rawSearch) return { metas: [] };

  let imdbId = null; let parsed = { searchKey: rawSearch, searchYear: null, searchType: null };
  if (rawSearch.startsWith('tt')) { imdbId = rawSearch.split(':')[0]; }
  else {
    if (!cfg.enableTitleSearch) return { metas: [] };
    parsed = parseSearchKey(rawSearch);
    if (parsed.searchType && parsed.searchType !== type) return { metas: [] };
    try {
      const results = await searchTitle(parsed.searchKey, type);
      if (results && results.length) {
        if (parsed.searchYear) {
          const yr = parseInt(parsed.searchYear, 10);
          const byYear = results.find(r => parseInt(r.year, 10) === yr);
          imdbId = (byYear || results[0]).id;
        } else imdbId = results[0].id;
      }
    } catch {}
  }
  if (!imdbId) return { metas: [] };

  const key = cacheKey(type, imdbId) + `:${cfg.max}`;
  let similarMetas = cache.get(key);
  if (!similarMetas) {
    // Time budget to avoid long blocking (so the row appears quickly)
    try {
      const baseMeta = await fetchMeta(type, imdbId);
      const TIME_BUDGET_MS = 1500;
      const computePromise = computeSimilar(baseMeta, type, cfg);
      const raced = await Promise.race([
        computePromise,
        new Promise(res => setTimeout(() => res('__TIMEOUT__'), TIME_BUDGET_MS))
      ]);
      if (raced === '__TIMEOUT__') {
        // Background fill
        computePromise.then(res => {
          cache.set(key, res, res.length ? cfg.ttl : Math.min(300, Math.max(30, Math.round(cfg.ttl * 0.05))));
        }).catch(()=>{});
        return { metas: [ { id: 'ai:loading', type, name: 'Generating AI Similar…', poster: manifest.logo, description: 'Please wait a moment and re-open. (Background generation in progress)' } ] };
      } else {
        similarMetas = raced;
        cache.set(key, similarMetas, similarMetas.length ? cfg.ttl : Math.min(300, Math.max(30, Math.round(cfg.ttl * 0.05))));
      }
    } catch (e) {
      console.error('Catalog handler error', e); similarMetas = [];
    }
  }
  if (!similarMetas) return { metas: [] };
  const metasWithReason = (similarMetas || []).map(m => ({
    ...m,
    type: m.type || type,
    description: (m.description ? m.description + '\n' : '') + (m.reason ? 'Reason: ' + m.reason : '')
  }));
  return { metas: metasWithReason };
});

// Stream handler deep-link to search
builder.defineStreamHandler(async ({ type, id }) => {
  const imdbId = id.split(':')[0];
  const appUrl = `stremio:///search?search=${imdbId}`;
  const webUrl = `https://web.stremio.com/#/search?search=${imdbId}`;
  return { streams: [
    { name: 'AI Similar', title: 'AI Similar (App Search)', externalUrl: appUrl, behaviorHints: { notWebReady: true } },
    { name: 'AI Similar', title: 'AI Similar (Web Search)', externalUrl: webUrl, behaviorHints: { notWebReady: true } }
  ] };
});

const addonInterface = builder.getInterface();
const port = process.env.PORT || 7000;
serveHTTP(addonInterface, { port, static: 'web' });
console.log(`AI Similar Add-on (search deep-link mode) running on :${port}`);
