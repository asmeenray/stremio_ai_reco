import { fetch } from 'undici';

const TMDB_BASE = 'https://api.themoviedb.org/3';

function headers(key){
  return { Authorization: `Bearer ${key}`, accept: 'application/json' };
}

export async function tmdbFindImdbMeta(title, year, type, key){
  if(!key) return null;
  const searchType = type === 'series' ? 'tv' : 'movie';
  const url = `${TMDB_BASE}/search/${searchType}?query=${encodeURIComponent(title)}${year?`&year=${year}`:''}`;
  const res = await fetch(url, { headers: headers(key) });
  if(!res.ok) return null;
  const data = await res.json();
  if(!data.results?.length) return null;
  const first = data.results[0];
  // Need external IDs to map to IMDb
  const detailsUrl = `${TMDB_BASE}/${searchType}/${first.id}/external_ids`;
  const detRes = await fetch(detailsUrl, { headers: headers(key) });
  if(!detRes.ok) return null;
  const det = await detRes.json();
  if(!det.imdb_id) return null;
  return { id: det.imdb_id, name: first.title || first.name, type, year: (first.release_date||first.first_air_date||'').slice(0,4) };
}
