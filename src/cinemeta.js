import { fetch } from 'undici';
import { tmdbFindImdbMeta } from './tmdb.js';

const CINEMETA = 'https://v3-cinemeta.strem.io';

export async function fetchMeta(type, id) {
  const url = `${CINEMETA}/meta/${type}/${id}.json`;
  console.log('fetchMeta: Requesting', url);
  const res = await fetch(url);
  if (!res.ok) {
    console.error('fetchMeta: Failed', res.status, url);
    throw new Error('Cinemeta meta not found');
  }
  const data = await res.json();
  console.log('fetchMeta: Success for', data.meta?.name || id);
  return data.meta;
}

export async function searchTitle(query, type) {
  const url = `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.metas || [];
}

export async function mapSimilarToMetas(similar, type) {
  const results = [];
  const tmdbKey = process.env.TMDB_API_KEY; // optional
  for (const item of similar) {
    const q = `${item.title} ${item.year || ''}`.trim();
    try {
      let matches = await searchTitle(q, type);
      if (!matches.length && tmdbKey) {
        const tmdbMeta = await tmdbFindImdbMeta(item.title, item.year, type, tmdbKey);
        if (tmdbMeta) matches = [tmdbMeta];
      }
      if (matches.length) {
        results.push({ ...matches[0], reason: item.reason });
      } else {
        results.push({ id: `ai:${q}`, name: item.title, year: item.year, type, reason: item.reason });
      }
    } catch {
      results.push({ id: `ai:${q}`, name: item.title, year: item.year, type, reason: item.reason });
    }
  }
  return results;
}
