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
  const meta = data.meta;
  
  // If meta is missing required fields, try the other type
  if (!meta || !meta.name) {
    console.log('fetchMeta: Invalid meta, trying alternate type');
    const altType = type === 'movie' ? 'series' : 'movie';
    const altUrl = `${CINEMETA}/meta/${altType}/${id}.json`;
    console.log('fetchMeta: Requesting alternate', altUrl);
    
    try {
      const altRes = await fetch(altUrl);
      if (altRes.ok) {
        const altData = await altRes.json();
        if (altData.meta && altData.meta.name) {
          console.log('fetchMeta: Success for', altData.meta.name, 'via', altType);
          return { ...altData.meta, type: altType }; // Ensure type is correct
        }
      }
    } catch (e) {
      console.log('fetchMeta: Alternate type also failed');
    }
    
    throw new Error('No valid metadata found for either type');
  }
  
  console.log('fetchMeta: Success for', meta.name || id);
  return { ...meta, type }; // Ensure type is set
}

export async function searchTitle(query, type) {
  const url = `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.metas || [];
}

export async function mapSimilarToMetas(similar, type, originalTitle = '') {
  const results = [];
  const tmdbKey = process.env.TMDB_API_KEY; // optional
  
  // Function to check if it's the same series (for filtering out seasons)
  const isSameSeries = (title, originalTitle) => {
    if (!originalTitle || type !== 'series') return false;
    const cleanOriginal = originalTitle.toLowerCase().replace(/\s+(season|series|s\d+)\s*\d*$/i, '').trim();
    const cleanTitle = title.toLowerCase().replace(/\s+(season|series|s\d+)\s*\d*$/i, '').trim();
    
    // Check if titles are very similar (same base series)
    return cleanTitle.includes(cleanOriginal) || cleanOriginal.includes(cleanTitle) ||
           title.toLowerCase().includes(cleanOriginal) || originalTitle.toLowerCase().includes(cleanTitle.split(' ')[0]);
  };
  
  for (const item of similar) {
    // Skip if it's the same series (for series type)
    if (isSameSeries(item.title, originalTitle)) {
      console.log(`Skipping same series: ${item.title} (original: ${originalTitle})`);
      continue;
    }
    
    const q = `${item.title} ${item.year || ''}`.trim();
    try {
      let matches = await searchTitle(q, type);
      if (!matches.length && tmdbKey) {
        const tmdbMeta = await tmdbFindImdbMeta(item.title, item.year, type, tmdbKey);
        if (tmdbMeta) matches = [tmdbMeta];
      }
      if (matches.length) {
        const match = matches[0];
        // Ensure the result matches the requested type
        if (match.type === type || !match.type) {
          results.push({ 
            ...match, 
            year: match.year || item.year,
            type: type // Ensure correct type
          });
        }
      } else {
        results.push({ 
          id: `ai:${q}`, 
          name: item.title, 
          year: item.year, 
          type
        });
      }
    } catch {
      results.push({ 
        id: `ai:${q}`, 
        name: item.title, 
        year: item.year, 
        type
      });
    }
  }
  return results;
}
