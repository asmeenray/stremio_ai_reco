import { fetch } from 'undici';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-1.5-flash';

export async function getSimilarTitlesRaw(prompt, apiKey, { retries = 3, baseDelay = 500 } = {}) {
  const url = `${GEMINI_API_URL}/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [ { role: 'user', parts: [{ text: prompt }] } ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.9,
      maxOutputTokens: 512,
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
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const status = res.status;
        // Retry on 5xx
        if (status >= 500 && status < 600 && attempt <= retries) {
          const delay = baseDelay * 2 ** (attempt - 1) + Math.round(Math.random() * 100);
            await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Gemini API error ${status}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text;
    } catch (err) {
      // Network-level retry
      if (attempt <= retries && /ECONNRESET|ETIMEDOUT|fetch failed/i.test(err.message)) {
        const delay = baseDelay * 2 ** (attempt - 1) + Math.round(Math.random() * 100);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

export function buildPrompt(baseMeta) {
  const { name, year, genres = [], description = '' } = baseMeta || {};
  return `You are an assistant that outputs ONLY strict JSON. Given a film or series, respond with similar titles.\n` +
    `Return a JSON object with schema: {\n  "similar": [ { "title": string, "year": number|null, "reason": string } ]\n}\n` +
    `Rules: 1) 8 items max. 2) Focus on same tone, themes, or style. 3) Avoid sequels/prequels unless seminal. 4) No duplicates. 5) Prefer well-known global titles.\n` +
    `SOURCE TITLE: ${name} (${year || 'unknown year'})\nGENRES: ${genres.join(', ')}\nPLOT: ${description.slice(0,500)}\n` +
    `Now respond with JSON.`;
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
    return [];
  }
}
