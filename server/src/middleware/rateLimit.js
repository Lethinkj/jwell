/** Tiny in-memory rate limiter (per process). For multi-instance production
 * deployments, replace with a shared store (Redis). */
const buckets = new Map();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many attempts — try again later.' } = {}) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) b = { count: 0, reset: now + windowMs };
    b.count += 1;
    buckets.set(key, b);
    if (b.count > max) {
      res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited', message });
    }
    next();
  };
}

module.exports = { rateLimit };
