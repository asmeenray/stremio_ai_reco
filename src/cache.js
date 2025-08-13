import NodeCache from 'node-cache';

const ttl = parseInt(process.env.CACHE_TTL_SECONDS || '21600', 10);
export const cache = new NodeCache({ stdTTL: ttl, checkperiod: ttl / 2 });

export function cacheKey(type, id) {
  return `${type}:${id}`;
}
