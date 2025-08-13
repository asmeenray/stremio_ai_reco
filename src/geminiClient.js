import { fetch } from 'undici';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-1.5-flash';

export async function getSimilarTitlesRaw(prompt, apiKey, { retries = 2, baseDelay = 300 } = {}) {
  const url = `${GEMINI_API_URL}/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [ { role: 'user', parts: [{ text: prompt }] } ],
    generationConfig: {
      temperature: 0.4,
      topK: 20,
      topP: 0.8,
      maxOutputTokens: 1200, // Increased for 20 results
      responseMimeType: 'application/json'
    }
  };

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000) // 20 second timeout for 20 results
      });
      if (!res.ok) {
        const status = res.status;
        // Retry on 5xx and 429 (rate limit)
        if ((status >= 500 && status < 600) || status === 429) {
          if (attempt <= retries) {
            // Shorter delays for faster recovery
            const multiplier = status === 429 ? 2 : 1.5;
            const delay = baseDelay * multiplier ** (attempt - 1) + Math.round(Math.random() * 50);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        throw new Error(`Gemini API error ${status}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text;
    } catch (err) {
      // Network-level retry with shorter delays
      if (attempt <= retries && /ECONNRESET|ETIMEDOUT|fetch failed/i.test(err.message)) {
        const delay = baseDelay * 1.5 ** (attempt - 1) + Math.round(Math.random() * 50);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

export function buildPrompt(baseMeta) {
  const { name, year, genres = [], description = '', director = [], cast = [] } = baseMeta || {};
  const genreText = genres.length ? genres.slice(0, 3).join(', ') : 'Unknown';
  const plotText = description.slice(0, 250);
  const directorText = Array.isArray(director) ? director.slice(0, 2).join(', ') : director || '';
  const castText = Array.isArray(cast) ? cast.slice(0, 3).map(c => c.name || c).join(', ') : '';
  
  return `Find 20 similar ${baseMeta.type || 'titles'} to: ${name} (${year || '?'})\n` +
    `Genres: ${genreText}\n` +
    `${directorText ? `Director: ${directorText}\n` : ''}` +
    `${plotText ? `Plot: ${plotText}\n` : ''}` +
    `${castText ? `Cast: ${castText}\n` : ''}` +
    `JSON: {"similar":[{"title":"Movie Name","year":2020,"reason":"Brief reason"}]}\n` +
    `Priority: 1) Same franchise/series movies FIRST 2) Same director/genre 3) Similar themes/tone 4) Popular acclaimed titles\n` +
    `Keep reasons under 6 words. Include sequels, prequels, and franchise movies at the top.`;
}

export function parseSimilarJSON(text) {
  if (!text) return [];
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const obj = JSON.parse(cleaned);
    if (Array.isArray(obj)) return obj; // fallback if model returned array
    if (Array.isArray(obj.similar)) return obj.similar;
    return [];
  } catch (e) {
    console.error('parseSimilarJSON: Parse error', e.message);
    return [];
  }
}
