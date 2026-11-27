import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runWeeklyCycle = vi.fn();
vi.mock('@/lib/weeklyReport', () => ({ runWeeklyCycle: (o: unknown) => runWeeklyCycle(o) }));

import { GET } from '../route';

const SECRET = 'segredo-cron-teste';
const call = (qs = '', auth: string | null = `Bearer ${SECRET}`) =>
  GET(new Request(`http://localhost/api/cron/weekly-report${qs}`, { headers: auth === null ? {} : { authorization: auth } }));

const ciclo = (extra: Record<string, unknown> = {}) => ({
  preview: true,
  at: '2026-01-05T11:00:00Z',
  individual: { processed: 1, succeeded: 0, failed: 0, skipped: 0, results: [] },
  general: { enabled: true, email: null },
  cleared: 0,
  warnings: [],
  ...extra,
});

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  runWeeklyCycle.mockReset();
  runWeeklyCycle.mockResolvedValue(ciclo());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env.CRON_SECRET = SECRET;
});

describe('GET /api/cron/weekly-report - modo (prévia x real)', () => {
  it.each([
    ['', true],
    ['?send=true', true],
    ['?send=0', true],
    ['?send=', true],
    ['?send=2', true],
    ['?send=01', true],
    ['?send=1x', true],
    ['?SEND=1', true],
    ['?send=1', false],
    ['?send=1&format=html', false],
  ])('query %j -> preview=%s', async (qs, preview) => {
    runWeeklyCycle.mockResolvedValue(ciclo({ preview }));
    const r = await call(qs);
    expect(r.status).toBe(200);
    expect(runWeeklyCycle).toHaveBeenCalledTimes(1);
    expect(runWeeklyCycle).toHaveBeenCalledWith({ preview });
  });

  it('JSON com no-store', async () => {
    const r = await call();
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect((await r.json()).individual.processed).toBe(1);
  });
});

describe('GET /api/cron/weekly-report - autorização', () => {
  it('sem CRON_SECRET no env -> 401 mesmo com cabeçalho "Bearer undefined"/vazio', async () => {
    delete process.env.CRON_SECRET;
    expect((await call('', 'Bearer undefined')).status).toBe(401);
    expect((await call('', 'Bearer ')).status).toBe(401);
    expect(runWeeklyCycle).not.toHaveBeenCalled();
  });

  it('CRON_SECRET vazio -> 401', async () => {
    process.env.CRON_SECRET = '';
    expect((await call('', 'Bearer ')).status).toBe(401);
  });

  it('sem Authorization -> 401', async () => {
    const r = await call('?send=1', null);
    expect(r.status).toBe(401);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(runWeeklyCycle).not.toHaveBeenCalled();
  });

  it.each([['Bearer errado'], [SECRET], [`bearer ${SECRET}`], [`Bearer  ${SECRET}`], [`Bearer ${SECRET}x`]])(
    'Authorization %j -> 401 e nunca roda o ciclo',
    async (h) => {
      expect((await call('?send=1', h)).status).toBe(401);
      expect(runWeeklyCycle).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/cron/weekly-report - prévia em HTML', () => {
  const comEmail = (subject: string, html = '<p>ok</p>') =>
    ciclo({
      general: { enabled: true, email: { subject, to: ['a@x.com'], text: '', html } },
      warnings: ['<img src=x onerror=alert(1)>'],
    });

  it('devolve text/html com CSP restritiva e nosniff', async () => {
    runWeeklyCycle.mockResolvedValue(comEmail('Assunto'));
    const r = await call('?format=html');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.text()).toContain('Assunto');
  });

  it('escapa <script> vindo do título e dos avisos', async () => {
    runWeeklyCycle.mockResolvedValue(comEmail('<script>alert(1)</script>'));
    const html = await (await call('?format=html')).text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img src=x onerror');
  });

  it('inclui os e-mails individuais e informa destinatários vazios', async () => {
    runWeeklyCycle.mockResolvedValue(
      ciclo({
        individual: {
          processed: 1, succeeded: 0, failed: 0, skipped: 0,
          results: [{ email: { subject: 'Individual', to: [], text: '', html: '<b>x</b>' } }, { email: null }],
        },
      }),
    );
    const html = await (await call('?format=html')).text();
    expect(html).toContain('Individual');
    expect(html).toContain('(sem destinatários)');
  });

  it('format=html com envio real (send=1) continua devolvendo JSON', async () => {
    const r = await call('?send=1&format=html');
    expect(r.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('GET /api/cron/weekly-report - erros', () => {
  it('erro do ciclo -> 500 genérico, sem vazar a mensagem', async () => {
    runWeeklyCycle.mockRejectedValue(new Error('senha-do-banco=xyz'));
    const r = await call('?send=1');
    expect(r.status).toBe(500);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const corpo = JSON.stringify(await r.json());
    expect(corpo).toBe(JSON.stringify({ error: 'Falha no ciclo semanal' }));
  });

  it('rejeição que não é Error também vira 500 genérico', async () => {
    runWeeklyCycle.mockRejectedValue('texto');
    expect((await call()).status).toBe(500);
  });
});
