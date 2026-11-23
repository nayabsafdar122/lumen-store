// Same-origin image proxy for product photos hosted on cdn.dummyjson.com.
// Only that host is allowed (this is not an open proxy). Responses are cached by browsers
// and, on Vercel, by the CDN for a year, so each photo is fetched from the source only once.
const router = require('express').Router();

const SOURCE = 'https://cdn.dummyjson.com/product-images/';
const SAFE_PATH = /^[\w\-'.%()&]+(\/[\w\-'.%()&]+)*\.(webp|png|jpe?g)$/i;
const memory = new Map(); // small in-process cache
const MAX_ITEMS = 300;

router.get('/*path', async (req, res, next) => {
  const rel = [].concat(req.params.path).join('/');
  if (!SAFE_PATH.test(rel) || rel.includes('..')) return res.status(400).json({ error: { message: 'Invalid image path' } });
  try {
    let hit = memory.get(rel);
    if (!hit) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const upstream = await fetch(SOURCE + rel.split('/').map(encodeURIComponent).join('/'), { signal: ctrl.signal });
      clearTimeout(t);
      if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).end();
      hit = { type: upstream.headers.get('content-type') || 'image/webp', body: Buffer.from(await upstream.arrayBuffer()) };
      if (memory.size >= MAX_ITEMS) memory.delete(memory.keys().next().value);
      memory.set(rel, hit);
    }
    res.set({
      'Content-Type': hit.type,
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    res.send(hit.body);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).end();
    next(err);
  }
});

module.exports = router;
