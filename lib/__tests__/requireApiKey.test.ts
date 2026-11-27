import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateApiKey } from '@/lib/projects/apiKey';

// Estado do banco falso
type Row = { id: number; owner_name: string; revoked_at: string | null };
const db = {
  rows: new Map<string, Row>(),
  error: null as { code: string; message: string } | null,
  selects: 0,
  updates: [] as unknown[],
  updateError: null as { code: string } | null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, hash: string) => ({
          maybeSingle: async () => {
            db.selects++;
            if (db.error) return { data: null, error: db.error };
            return { data: db.rows.get(hash) ?? null, error: null };
          },
        }),
      }),
      update: (payload: unknown) => ({
        eq: async () => {
          db.updates.push(payload);
          return { error: db.updateError };
        },
      }),
    }),
  }),
}));

type Mod = typeof import('@/lib/requireApiKey');
let requireApiKey: Mod['requireApiKey'];

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/projetos', { headers });

function novaChave(row: Partial<Row> = {}) {
  const { key, hash } = generateApiKey();
  const full: Row = { id: 7, owner_name: 'Ana', revoked_at: null, ...row };
  db.rows.set(hash, full);
  return { key, hash, row: full };
}
const bearer = (key: string, ip?: string) => ({
  authorization: `Bearer ${key}`,
  ...(ip ? { 'x-real-ip': ip } : {}),
});
// formato válido, inexistente no banco
const falsa = (ip?: string) => ({ authorization: `Bearer ${generateApiKey().key}`, ...(ip ? { 'x-real-ip': ip } : {}) });
const ipGlobal = (i: number) => `20.0.${Math.floor(i / 250)}.${i % 250}`;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  vi.resetModules();
  db.rows.clear();
  db.error = null;
  db.selects = 0;
  db.updates = [];
  db.updateError = null;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ requireApiKey } = await import('@/lib/requireApiKey'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requireApiKey - autenticação', () => {
  it('sem Authorization -> 401 e sem consultar o banco', async () => {
    const r = await requireApiKey(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(db.selects).toBe(0);
  });

  it.each([['Basic abc'], ['Bearer'], ['Bearer mdf_xx_curta'], ['Bearer ' + 'a'.repeat(60)]])(
    'formato inválido %j -> 401 sem consultar o banco',
    async (h) => {
      const r = await requireApiKey(req({ authorization: h }));
      expect(!r.ok && r.response.status).toBe(401);
      expect(db.selects).toBe(0);
    },
  );

  it('chave inexistente -> 401', async () => {
    const r = await requireApiKey(req(falsa()));
    expect(!r.ok && r.response.status).toBe(401);
    expect(db.selects).toBe(1);
  });

  it('chave revogada -> 401', async () => {
    const { key } = novaChave({ revoked_at: '2025-12-31T00:00:00Z' });
    const r = await requireApiKey(req(bearer(key)));
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('revogada logo após ter sido validada (cache validadasRecentes) -> 401 mesmo assim', async () => {
    const { key, row } = novaChave();
    expect((await requireApiKey(req(bearer(key)))).ok).toBe(true);
    row.revoked_at = '2026-01-01T12:00:05Z';
    vi.advanceTimersByTime(5_000);
    const r = await requireApiKey(req(bearer(key)));
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('sucesso devolve author e keyId vindos do banco', async () => {
    const { key } = novaChave({ id: 42, owner_name: 'Carlos' });
    const r = await requireApiKey(req(bearer(key)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.author).toBe('Carlos');
      expect(r.keyId).toBe(42);
      expect(r.admin).toBeDefined();
    }
  });
});

describe('requireApiKey - falhas de infraestrutura', () => {
  it.each([['SUPABASE_SERVICE_ROLE_KEY'], ['NEXT_PUBLIC_SUPABASE_URL']])('env %s ausente -> 500 sem detalhe', async (nome) => {
    delete process.env[nome];
    const { key } = novaChave();
    const r = await requireApiKey(req(bearer(key)));
    expect(!r.ok && r.response.status).toBe(500);
    if (!r.ok) {
      const corpo = JSON.stringify(await r.response.json());
      expect(corpo).toBe(JSON.stringify({ error: 'Erro interno' }));
    }
    expect(db.selects).toBe(0);
  });

  it('erro do banco -> 500 sem detalhe', async () => {
    db.error = { code: 'XX000', message: 'segredo-interno-do-banco' };
    const { key } = novaChave();
    const r = await requireApiKey(req(bearer(key)));
    expect(!r.ok && r.response.status).toBe(500);
    if (!r.ok) {
      const corpo = JSON.stringify(await r.response.json());
      expect(corpo).not.toContain('segredo-interno');
      expect(corpo).toContain('Erro interno');
    }
  });

  it('grava last_used_at no máximo a cada 5 min por chave', async () => {
    const { key } = novaChave();
    await requireApiKey(req(bearer(key)));
    await requireApiKey(req(bearer(key)));
    expect(db.updates).toHaveLength(1);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await requireApiKey(req(bearer(key)));
    expect(db.updates).toHaveLength(2);
    expect(db.updates[1]).toEqual({ last_used_at: new Date().toISOString() });
  });

  it('falha ao gravar last_used_at não derruba a requisição e tenta de novo', async () => {
    db.updateError = { code: 'XX000' };
    const { key } = novaChave();
    expect((await requireApiKey(req(bearer(key)))).ok).toBe(true);
    expect((await requireApiKey(req(bearer(key)))).ok).toBe(true);
    expect(db.updates).toHaveLength(2);
  });
});

describe('requireApiKey - limites', () => {
  it('IP: 31 falhas ainda respondem 401 (a 31ª dispara o bloqueio); a 32ª já é 429 com Retry-After', async () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < 31; i++) {
      const r = await requireApiKey(req(falsa(ip)));
      expect(!r.ok && r.response.status).toBe(401);
    }
    const bloqueada = await requireApiKey(req(falsa(ip)));
    expect(!bloqueada.ok && bloqueada.response.status).toBe(429);
    if (!bloqueada.ok) expect(bloqueada.response.headers.get('Retry-After')).toBe('60');
  });

  it('bloqueio por IP não consulta o banco', async () => {
    for (let i = 0; i < 31; i++) await requireApiKey(req(falsa('10.0.0.2')));
    const antes = db.selects;
    await requireApiKey(req(falsa('10.0.0.2')));
    expect(db.selects).toBe(antes);
  });

  it('outro IP não é afetado pelo bloqueio', async () => {
    for (let i = 0; i < 31; i++) await requireApiKey(req(falsa('10.0.0.3')));
    const r = await requireApiKey(req(falsa('10.0.0.4')));
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('o bloqueio expira após 1 minuto', async () => {
    for (let i = 0; i < 31; i++) await requireApiKey(req(falsa('10.0.0.5')));
    vi.advanceTimersByTime(60_001);
    const r = await requireApiKey(req(falsa('10.0.0.5')));
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('X-Forwarded-For é ignorado: variar o header não escapa do bloqueio por X-Real-IP', async () => {
    for (let i = 0; i < 31; i++) {
      await requireApiKey(req({ ...falsa('10.0.0.6'), 'x-forwarded-for': `1.2.3.${i}` }));
    }
    const r = await requireApiKey(req({ ...falsa('10.0.0.6'), 'x-forwarded-for': '9.9.9.9' }));
    expect(!r.ok && r.response.status).toBe(429);
  });

  it('X-Forwarded-For sozinho não cria balde por IP', async () => {
    for (let i = 0; i < 40; i++) {
      const r = await requireApiKey(req({ ...falsa(), 'x-forwarded-for': '7.7.7.7' }));
      expect(!r.ok && r.response.status).toBe(401);
    }
  });

  it('teto global: 301 falhas somando IPs ainda dão 401; depois 429 até para IP novo', async () => {
    for (let i = 0; i < 301; i++) {
      const r = await requireApiKey(req(falsa(ipGlobal(i))));
      expect(!r.ok && r.response.status).toBe(401);
    }
    const r = await requireApiKey(req(falsa('30.0.0.1')));
    expect(!r.ok && r.response.status).toBe(429);
  });

  it('chave válida conhecida passa durante bloqueio do IP; chave desconhecida do mesmo IP não', async () => {
    const ip = '10.0.0.7';
    const { key } = novaChave();
    expect((await requireApiKey(req(bearer(key, ip)))).ok).toBe(true);
    for (let i = 0; i < 31; i++) await requireApiKey(req(falsa(ip)));
    expect((await requireApiKey(req(falsa(ip)))).ok).toBe(false);
    expect((await requireApiKey(req(bearer(key, ip)))).ok).toBe(true);
  });

  it('chave válida conhecida passa durante bloqueio global', async () => {
    const { key } = novaChave();
    expect((await requireApiKey(req(bearer(key, '11.0.0.1')))).ok).toBe(true);
    for (let i = 0; i < 301; i++) await requireApiKey(req(falsa(ipGlobal(i))));
    const bloqueada = await requireApiKey(req(falsa('11.0.0.9')));
    expect(!bloqueada.ok && bloqueada.response.status).toBe(429);
    expect((await requireApiKey(req(bearer(key, '11.0.0.2')))).ok).toBe(true);
  });

  it('a 61ª requisição da mesma chave em 1 minuto -> 429 com Retry-After; outra chave não é afetada', async () => {
    const a = novaChave({ id: 1 });
    const b = novaChave({ id: 2 });
    for (let i = 0; i < 60; i++) expect((await requireApiKey(req(bearer(a.key)))).ok).toBe(true);
    const r = await requireApiKey(req(bearer(a.key)));
    expect(!r.ok && r.response.status).toBe(429);
    if (!r.ok) expect(r.response.headers.get('Retry-After')).toBe('60');
    expect((await requireApiKey(req(bearer(b.key)))).ok).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect((await requireApiKey(req(bearer(a.key)))).ok).toBe(true);
  });

  it('avisa (no máximo 1x por minuto) quando falta X-Real-IP', async () => {
    const warn = vi.spyOn(console, 'warn');
    await requireApiKey(req());
    await requireApiKey(req());
    expect(warn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await requireApiKey(req());
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
