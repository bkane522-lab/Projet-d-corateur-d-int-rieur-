// api/_lib/rateLimit.js
// Limitation de requêtes par IP, via Upstash Redis (cohérent avec le reste de la stack).
// Fenêtre glissante simple : compte les requêtes sur une fenêtre de temps donnée.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Retourne true si la requête est autorisée, false si la limite est dépassée.
 * `key` doit identifier l'action (ex: "create-dossier"), combiné à l'IP.
 * Si Upstash n'est pas configuré, la limitation est ignorée (fail-open) mais un
 * avertissement est loggé — à ne pas laisser ainsi en production réelle.
 */
async function checkRateLimit(req, key, { limit = 10, windowSeconds = 3600 } = {}) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('Rate limiting désactivé : UPSTASH_REDIS_REST_URL / TOKEN manquants');
    return true;
  }

  const ip = getClientIp(req);
  const redisKey = `ratelimit:${key}:${ip}`;

  try {
    const incrRes = await fetch(`${UPSTASH_URL}/incr/${redisKey}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const incrData = await incrRes.json();
    const count = incrData.result;

    if (count === 1) {
      // Première requête de la fenêtre : on pose l'expiration.
      await fetch(`${UPSTASH_URL}/expire/${redisKey}/${windowSeconds}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
    }

    return count <= limit;
  } catch (err) {
    console.error('Erreur rate limit Upstash:', err);
    return true; // fail-open : une panne Redis ne doit pas bloquer tout le site
  }
}

module.exports = { checkRateLimit, getClientIp };
