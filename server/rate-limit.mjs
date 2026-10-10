// Limite de tentativas de acesso.
//
// Em PostgreSQL o estado é gravado no banco. Em um ambiente serverless cada
// instância tem memória própria, então um Map em processo deixaria de valer a
// partir da segunda instância — o limite passaria a ser contornado trivialmente.
// Em SQLite (desenvolvimento) o estado em memória é suficiente e mais rápido.
const PRUNE_INTERVAL_MS = 60_000;
const RETENTION_MS = 3_600_000;
const MAX_KEYS = 5000;

export function createRateLimiter(db) {
  if (db.dialect === 'postgres') {
    let lastPrune = 0;
    const prune = async () => {
      const now = Date.now();
      if (now - lastPrune < PRUNE_INTERVAL_MS) return;
      lastPrune = now;
      try { await db.prepare('DELETE FROM rate_limits WHERE at<?').run(now - RETENTION_MS); }
      catch { /* limpeza é oportunista e nunca deve falhar uma requisição */ }
    };
    return {
      shared: true,
      async recent(key, windowMs = 15 * 60000) {
        const row = await db.prepare('SELECT count(*) n FROM rate_limits WHERE key=? AND at>?').get(key, Date.now() - windowMs);
        return { count: Number(row?.n ?? 0) };
      },
      async hit(key) {
        await db.prepare('INSERT INTO rate_limits(key,at) VALUES(?,?)').run(key, Date.now());
        await prune();
      }
    };
  }

  const attempts = new Map();
  return {
    shared: false,
    async recent(key, windowMs = 15 * 60000) {
      const now = Date.now();
      for (const [entry, times] of attempts) if (times.at(-1) < now - RETENTION_MS) attempts.delete(entry);
      const recent = (attempts.get(key) || []).filter(time => time > now - windowMs);
      if (!attempts.has(key) && attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value);
      attempts.set(key, recent);
      return { count: recent.length };
    },
    async hit(key) {
      const times = attempts.get(key);
      if (times) times.push(Date.now());
    }
  };
}
