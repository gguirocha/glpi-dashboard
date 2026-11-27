import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const admin = { rpc: vi.fn(), from: vi.fn() };
const guard = vi.fn();
vi.mock('@/lib/requireApiKey', () => ({ requireApiKey: (r: unknown) => guard(r) }));

import { GET, PATCH } from '../route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = () => new NextRequest('http://localhost/api/projetos/1');
const patch = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/projetos/1', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
  });

type Res = { data?: unknown; error?: { code: string; message?: string } | null };
// Monta o encadeamento de leitura: projeto (maybeSingle) e eventos (limit)
function lerComo(proj: Res, evs: Res) {
  const eventos = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
  eventos.select.mockReturnValue(eventos);
  eventos.eq.mockReturnValue(eventos);
  eventos.order.mockReturnValue(eventos);
  eventos.limit.mockResolvedValue({ data: evs.data ?? null, error: evs.error ?? null });
  const projetos = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  projetos.select.mockReturnValue(projetos);
  projetos.eq.mockReturnValue(projetos);
  projetos.maybeSingle.mockResolvedValue({ data: proj.data ?? null, error: proj.error ?? null });
  admin.from.mockImplementation((t: string) => (t === 'dashboard_projects' ? projetos : eventos));
  return { projetos, eventos };
}

beforeEach(() => {
  admin.rpc.mockReset();
  admin.from.mockReset();
  guard.mockReset();
  guard.mockResolvedValue({ ok: true, admin, keyId: 9, author: 'Ana' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/projetos/[id]', () => {
  it('sem chave -> resposta do guard, sem banco', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'x' }, { status: 401 }) });
    expect((await GET(get(), ctx('1'))).status).toBe(401);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it.each([['0'], ['01'], ['abc'], ['-1'], ['1.5'], ['9999999999999']])('id %j -> 400 sem tocar no banco', async (id) => {
    const r = await GET(get(), ctx(id));
    expect(r.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('devolve projeto e eventos recentes, com no-store', async () => {
    const { projetos, eventos } = lerComo({ data: { id: 3, title: 'P' } }, { data: [{ id: 1 }] });
    const r = await GET(get(), ctx('3'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ project: { id: 3, title: 'P' }, events: [{ id: 1 }] });
    expect(projetos.eq).toHaveBeenCalledWith('id', 3);
    expect(eventos.eq).toHaveBeenCalledWith('project_id', 3);
    expect(eventos.limit).toHaveBeenCalledWith(20);
    expect(projetos.select.mock.calls[0][0]).not.toBe('*');
  });

  it('projeto inexistente -> 404', async () => {
    lerComo({ data: null }, { data: [] });
    const r = await GET(get(), ctx('3'));
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('erro ao ler projeto -> 500 genérico', async () => {
    lerComo({ error: { code: 'XX000', message: 'segredo' } }, { data: [] });
    const r = await GET(get(), ctx('3'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('segredo');
  });

  it('erro ao ler eventos -> 500 genérico', async () => {
    lerComo({ data: { id: 3 } }, { error: { code: 'XX000', message: 'segredo' } });
    const r = await GET(get(), ctx('3'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('segredo');
  });
});

describe('PATCH /api/projetos/[id]', () => {
  it('sem chave -> resposta do guard, sem banco', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'x' }, { status: 401 }) });
    expect((await PATCH(patch({ project: { title: 'A' } }), ctx('1'))).status).toBe(401);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([['0'], ['01'], ['abc']])('id %j -> 400 sem tocar no banco (nem ler o corpo)', async (id) => {
    const r = await PATCH(patch({ project: { title: 'A' } }), ctx(id));
    expect(r.status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('grava via rpc api_write_project com id, author e keyId; nunca update direto', async () => {
    admin.rpc.mockResolvedValue({ data: { id: 4, phase: 'escopo' }, error: null });
    const r = await PATCH(
      patch({ project: { phase: 'escopo' }, event: { kind: 'g1', summary: 'Portão 1' } }),
      ctx('4'),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ project: { id: 4, phase: 'escopo' } });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith('api_write_project', {
      p_id: 4,
      p_project: { phase: 'escopo' },
      p_event: { kind: 'g1', summary: 'Portão 1' },
      p_author: 'Ana',
      p_key_id: 9,
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('só event (sem project) é aceito', async () => {
    admin.rpc.mockResolvedValue({ data: {}, error: null });
    const r = await PATCH(patch({ event: { kind: 'bloqueio', summary: 'Parado' } }), ctx('4'));
    expect(r.status).toBe(200);
    expect(admin.rpc.mock.calls[0][1].p_project).toEqual({});
  });

  it.each([['vazio', {}], ['project vazio', { project: {} }], ['campo desconhecido', { project: { foo: 1 } }]])(
    'corpo inválido (%s) -> 400 sem banco',
    async (_n, corpo) => {
      expect((await PATCH(patch(corpo), ctx('4'))).status).toBe(400);
      expect(admin.rpc).not.toHaveBeenCalled();
    },
  );

  it('corpo > 16 KB -> 413 sem banco', async () => {
    const r = await PATCH(patch({ project: { next_step: 'a'.repeat(17 * 1024) } }), ctx('4'));
    expect(r.status).toBe(413);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0002', 404],
    ['22023', 422],
    ['22P02', 422],
    ['42501', 403],
    ['55P03', 503],
    ['XX000', 500],
  ])('erro do banco %s -> %i sem vazar a mensagem', async (code, status) => {
    admin.rpc.mockResolvedValue({ data: null, error: { code, message: 'detalhe-secreto' } });
    const r = await PATCH(patch({ project: { title: 'A' } }), ctx('4'));
    expect(r.status).toBe(status);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(await r.json())).not.toContain('detalhe-secreto');
  });
});
