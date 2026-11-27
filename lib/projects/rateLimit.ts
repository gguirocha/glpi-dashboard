/**
 * Janela deslizante simples por id, em memória. Retorna true se permitido.
 * Requisições negadas não consomem cota.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  return (id: string): boolean => {
    const t = now();
    const cutoff = t - windowMs;

    // Varredura periódica: remove ids sem hits dentro da janela.
    if (t - lastSweep >= windowMs) {
      for (const [k, arr] of hits) {
        if (arr[arr.length - 1] <= cutoff) hits.delete(k);
      }
      lastSweep = t;
    }

    const arr = (hits.get(id) ?? []).filter((x) => x > cutoff);
    if (arr.length >= limit) {
      hits.set(id, arr);
      return false;
    }
    arr.push(t);
    hits.set(id, arr);
    return true;
  };
}
