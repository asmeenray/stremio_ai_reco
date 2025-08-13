import 'dotenv/config';
import sdk from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = sdk;
import { fetchMeta, mapSimilarToMetas } from './cinemeta.js';
import { buildPrompt, getSimilarTitlesRaw, parseSimilarJSON } from './geminiClient.js';
import { cache, cacheKey } from './cache.js';

const manifest = {
  id: 'community.stremio.ai-similar',
  version: '0.1.0',
  name: 'AI Similar Titles',
  description: 'Gemini AI generated similar movies/series',
  logo: 'https://stremio-logo.s3.eu-central-1.amazonaws.com/stremio-icon.png',
  background: 'https://stremio-logo.s3.eu-central-1.amazonaws.com/hero-bg.png',
  types: ['movie', 'series'],
  catalogs: [
    // imdbId now optional; placeholder shown if missing
    { type: 'movie', id: 'ai-similar', name: 'AI Similar', extra: [{ name: 'imdbId' }, { name: 'max' }] },
    { type: 'series', id: 'ai-similar', name: 'AI Similar', extra: [{ name: 'imdbId' }, { name: 'max' }] }
  ],
  resources: [
    'meta',
    'stream',
    {
      name: 'catalog',
      types: ['movie', 'series'],
      idPrefixes: ['similar', 'ai-similar']
    }
  ],
  idPrefixes: ['tt'],
  behaviorHints: { configurable: true, configurationRequired: true },
  config: [
    { key: 'geminiKey', title: 'Gemini API Key', type: 'text', required: true },
    { key: 'tmdbKey', title: 'TMDB (optional, improves matching)', type: 'text' },
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
    max: Math.min(12, Math.max(1, maxRaw))
  };
}

async function computeSimilar(baseMeta, type, cfg){
  if (!cfg.geminiKey) return [];
  const prompt = buildPrompt(baseMeta);
  let raw;
  try {
    raw = await getSimilarTitlesRaw(prompt, cfg.geminiKey);
  } catch (e) {
    if (/Gemini API error 5/.test(e.message)) {
      // transient error, return empty list (will be negative cached by caller)
      return [];
    }
    throw e;
  }
  const parsed = parseSimilarJSON(raw).slice(0, cfg.max);
  return mapSimilarToMetas(parsed, type);
}

builder.defineMetaHandler(async ({ type, id, extra, config }) => {
  const cfg = normalizeRuntimeConfig(extra, config);
  try {
    const baseMeta = await fetchMeta(type, id);
    const key = cacheKey(type, id) + `:${cfg.max}`;
    let similarMetas = cache.get(key);
    if (!similarMetas && cfg.geminiKey) {
      similarMetas = await computeSimilar(baseMeta, type, cfg);
      // negative cache: short TTL if empty
      cache.set(key, similarMetas, similarMetas.length ? cfg.ttl : Math.min(300, Math.max(30, Math.round(cfg.ttl * 0.05))));
    }
    // Add two links: deep link (may not show on all clients) and a web fallback
    const webLink = `/web/?type=${type}&imdbId=${id}`; // relative so Stremio loads it in webview
    const links = [
      { name: 'AI Similar (Discover)', category: 'recommendation', url: `stremio://discover/${type}/ai-similar/imdbId=${id}` },
      { name: 'AI Similar (Web)', category: 'recommendation', url: webLink }
    ];
    return { meta: { ...baseMeta, aiSimilar: similarMetas || [], links } };
  } catch (e) {
    console.error('Meta handler error', e);
    return { meta: { id, type, name: 'Unknown', aiSimilar: [], error: e.message } };
  }
});

builder.defineCatalogHandler(async ({ type, id, extra, config }) => {
  const cfg = normalizeRuntimeConfig(extra, config);
  if (id === 'ai-similar') {
    const imdbId = extra?.imdbId;
    if (!imdbId) {
      // Instructional placeholder meta
      return { metas: [ {
        id: 'ai:instructions',
        type,
        name: 'Enter an IMDb ID (tt...)',
        description: 'Usage: In the search/extra box type imdbId=tt1234567 OR open a title and choose AI Similar provider to deep-link here.',
        poster: manifest.logo,
        background: manifest.background
      } ] };
    }
    const key = cacheKey(type, imdbId) + `:${cfg.max}`;
    let similarMetas = cache.get(key);
    if (!similarMetas && cfg.geminiKey) {
      try {
        const baseMeta = await fetchMeta(type, imdbId);
        similarMetas = await computeSimilar(baseMeta, type, cfg);
        cache.set(key, similarMetas, similarMetas.length ? cfg.ttl : Math.min(300, Math.max(30, Math.round(cfg.ttl * 0.05))));
      } catch (e) {
        console.error('Static catalog handler error', e);
        similarMetas = [];
      }
    }
    const metasWithReason = (similarMetas || []).map(m => ({
      ...m,
      type: m.type || type,
      description: (m.description ? m.description + '\n' : '') + (m.reason ? 'Reason: ' + m.reason : '')
    }));
    return { metas: metasWithReason };
  }
  if (id.startsWith('similar:')) {
    const originalId = id.split(':')[1];
    const key = cacheKey(type, originalId) + `:${cfg.max}`;
    let similarMetas = cache.get(key);
    if (!similarMetas && cfg.geminiKey) {
      try {
        const baseMeta = await fetchMeta(type, originalId);
        similarMetas = await computeSimilar(baseMeta, type, cfg);
        cache.set(key, similarMetas, similarMetas.length ? cfg.ttl : Math.min(300, Math.max(30, Math.round(cfg.ttl * 0.05))));
      } catch (e) {
        console.error('Dynamic catalog handler error', e);
        similarMetas = [];
      }
    }
    const metasWithReason = (similarMetas || []).map(m => ({
      ...m,
      type: m.type || type,
      description: (m.description ? m.description + '\n' : '') + (m.reason ? 'Reason: ' + m.reason : '')
    }));
    return { metas: metasWithReason };
  }
  return { metas: [] };
});

// Replace existing stream handler with inert navigation stream
builder.defineStreamHandler(async ({ type, id }) => {
  let titleName = id;
  try { const meta = await fetchMeta(type, id); titleName = meta?.name || id; } catch {}
  const catalogUrl = `/catalog/${type}/ai-similar.json?imdbId=${id}`;
  return { streams: [{
    name: 'AI Similar',
    title: `AI Similar for ${titleName}`,
    description: 'Opens the AI Similar catalog (Discover view).',
    url: catalogUrl,
    behaviorHints: { notWebReady: true }
  }] };
});

const addonInterface = builder.getInterface();
const port = process.env.PORT || 7000;
serveHTTP(addonInterface, { port, static: 'web' });
console.log(`AI Similar Add-on + UI running on :${port}`);
