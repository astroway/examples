/**
 * Cloudflare Worker — edge chart cache.
 *
 * Drops a Worker in front of /v1/chart that caches identical birth-data
 * requests in Cloudflare KV for 30 days. Use case: a high-traffic
 * horoscope site where 95% of chart requests are repeats. Effect:
 * 50–100ms p50 instead of 200–500ms, plus credit savings.
 *
 * This one talks to the API over plain HTTP (no SDK) — a Worker proxies
 * raw request bodies through, so there's nothing to deserialize.
 *
 * Deploy: wrangler deploy
 * Bindings (wrangler.toml):
 *   [[kv_namespaces]] binding = "CHART_CACHE", id = "..."
 *   [vars] ASTROWAY_API_KEY = "aw_live_..."
 */
export interface Env {
  CHART_CACHE: KVNamespace;
  ASTROWAY_API_KEY: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    const body = await req.text();
    const cacheKey = `chart:${await sha256(body)}`;

    const cached = await env.CHART_CACHE.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { 'content-type': 'application/json', 'x-edge-cache': 'HIT' },
      });
    }

    const upstream = await fetch('https://api.astroway.info/v1/chart', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ASTROWAY_API_KEY },
      body,
    });
    const json = await upstream.text();

    if (upstream.ok) {
      await env.CHART_CACHE.put(cacheKey, json, { expirationTtl: 30 * 86400 });
    }
    return new Response(json, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', 'x-edge-cache': 'MISS' },
    });
  },
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
