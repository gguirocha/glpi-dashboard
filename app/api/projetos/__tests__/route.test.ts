import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const admin = { rpc: vi.fn(), from: vi.fn() };
const guard = vi.fn();
vi.mock('@/lib/requireApiKey', () => ({ requireApiKey: (r: unknown) => guard(r) }));

import { POST } from '../route';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/projetos', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
  });

beforeEach(() => {
  admin.rpc.mockReset();
  admin.from.mockReset();
  guard.mockReset();
  guard.mockResolvedValue({ ok: true, admin, keyId: 9, author: 'Ana' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/projetos', () => {
  it('sem chave válida devolve a resposta do guard e não toca no banco', async () => {
    guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) });
    const r = await POST(post({ project: { title: 'X' } }));
    expect(r.status).toBe(401);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('grava via rpc api_write_project com author e keyId do guard, nunca insert direto', async () => {
    admin.rpc.mockResolvedValue({ data: { id: 5, title: 'Novo' }, error: null });
    const r = await POST(post({ project: { title: ' Novo ' }, event: { kind: 'aberto', summary: 'Abertura' } }));
    expect(r.status).toBe(201);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ project: { id: 5, title: 'Novo' } });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith('api_write_project', {
      p_id: null,
      p_project: { title: 'Novo' },
      p_event: { kind: 'aberto', summary: 'Abertura' },
      p_author: 'Ana',
      p_key_id: 9,
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('sem event envia p_event null', async () => {
    admin.rpc.mockResolvedValue({ data: {}, error: null });
    await POST(post({ project: { title: 'X' } }));
    expect(admin.rpc.mock.calls[0][1].p_event).toBeNull();
  });

  it('autor vem da chave, não do corpo (campo author é rejeitado)', async () => {
    const r = await POST(post({ project: { title: 'X', author: 'Fraude' } }));
    expect(r.status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['sem title', { project: {} }],
    ['sem project', {}],
    ['campo desconhecido no topo', { project: { title: 'X' }, extra: 1 }],
    ['array', []],
  ])('corpo inválido (%s) -> 400 sem tocar no banco', async (_n, corpo) => {
    const r = await POST(post(corpo));
    expect(r.status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('JSON malformado -> 400', async () => {
    expect((await POST(post('{nao-json'))).status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('corpo vazio -> 400', async () => {
    expect((await POST(post('   '))).status).toBe(400);
  });

  it('corpo > 16 KB -> 413 sem tocar no banco', async () => {
    const r = await POST(post({ project: { title: 'X', next_step: 'a'.repeat(17 * 1024) } }));
    expect(r.status).toBe(413);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('Content-Length declarado acima do limite -> 413', async () => {
    const r = await POST(post({ project: { title: 'X' } }, { 'content-length': String(16 * 1024 + 1) }));
    expect(r.status).toBe(413);
  });

  it.each([
    ['22023', 422],
    ['23514', 422],
    ['42501', 403],
    ['P0002', 404],
    ['55P03', 503],
    ['XX000', 500],
  ])('erro do banco %s -> %i sem vazar a mensagem', async (code, status) => {
    admin.rpc.mockResolvedValue({ data: null, error: { code, message: 'detalhe-secreto' } });
    const r = await POST(post({ project: { title: 'X' } }));
    expect(r.status).toBe(status);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(await r.json())).not.toContain('detalhe-secreto');
  });
});
