import { fetch } from 'undici';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-1.5-flash-8b'; // Faster 8B model

export async function getSimilarTitlesRaw(prompt, apiKey, { retries = 2, baseDelay = 300 } = {}) {
  const url = `${GEMINI_API_URL}/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [ { role: 'user', parts: [{ text: prompt }] } ],
    generationConfig: {
      temperature: 0.3, // Lower for more focused responses
      topK: 15, // Reduced for faster generation
      topP: 0.7, // More deterministic
      maxOutputTokens: 400, // Reduced since no reasons needed
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
        signal: AbortSignal.timeout(15000) // Reduced timeout
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
  const { name, year, genres = [], description = '' } = baseMeta || {};
  const genreText = genres.length ? genres.slice(0, 2).join(', ') : 'Unknown';
  const plotText = description.slice(0, 150); // Shorter for speed
  
  if (baseMeta.type === 'series') {
    return `List 20 similar TV series to: ${name} (${year || '?'})\n` +
           `Genre: ${genreText}\n` +
           `${plotText ? `Plot: ${plotText}\n` : ''}` +
           `JSON: {"similar":[{"title":"Series Name","year":2020}]}\n` +
           `ONLY TV series. NO seasons of "${name}".`;
  } else {
    return `List 20 similar movies to: ${name} (${year || '?'})\n` +
           `Genre: ${genreText}\n` +
           `${plotText ? `Plot: ${plotText}\n` : ''}` +
           `JSON: {"similar":[{"title":"Movie Name","year":2020}]}\n` +
           `Franchise sequels first, then similar movies. ONLY movies.`;
  }
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
