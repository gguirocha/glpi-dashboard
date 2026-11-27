import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { idDaRota, erroDoBanco, lerCorpo, responder, erro, TAMANHO_MAXIMO_CORPO } from '../apiRoute';

const mk = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/projetos', {
    method: 'POST',
    body,
    headers,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as ConstructorParameters<typeof NextRequest>[1]);

afterEach(() => vi.restoreAllMocks());

describe('idDaRota', () => {
  it.each([['0'], ['-1'], ['1.5'], ['abc'], ['1234567890123'], ['007'], [' 1'], ['']])('rejeita %j', (v) => {
    expect(idDaRota(v)).toBeNull();
  });
  it('aceita 1', () => expect(idDaRota('1')).toBe(1));
});

describe('responder/erro', () => {
  it('sempre com no-store e Vary', async () => {
    const r = responder({ a: 1 }, 201, { 'X-Extra': 'y' });
    expect(r.status).toBe(201);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Vary')).toBe('Authorization');
    expect(r.headers.get('X-Extra')).toBe('y');
    expect(await r.json()).toEqual({ a: 1 });
  });
  it('status padrão 200', () => expect(responder({}).status).toBe(200));
  it('erro usa headers e corpo {error}', async () => {
    const r = erro('x', 429, { 'Retry-After': '5' });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('5');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ error: 'x' });
  });
});

describe('erroDoBanco', () => {
  const SEGREDO = 'segredo-interno-xyz';
  const casos: [string, number][] = [
    ['P0002', 404], ['22023', 422], ['22007', 422], ['22008', 422], ['22P02', 422], ['22003', 422],
    ['22P05', 422], ['23502', 422], ['23503', 422], ['23514', 422], ['42501', 403], ['55P03', 503], ['XX000', 500],
  ];
  it.each(casos)('código %s -> %i sem vazar message', async (code, status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = erroDoBanco({ code, message: SEGREDO }, 'ctx');
    expect(r.status).toBe(status);
    expect(JSON.stringify(await r.json())).not.toContain(SEGREDO);
  });
  it('mensagens fixas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await erroDoBanco({ code: '22003' }, 'c').json()).toEqual({ error: 'Dados recusados pelas regras do projeto' });
    expect(await erroDoBanco({ code: '55P03' }, 'c').json()).toEqual({ error: 'Projeto ocupado, tente de novo' });
    expect(await erroDoBanco(null, 'c').json()).toEqual({ error: 'Erro interno' });
  });
  it('500 loga só o código', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    erroDoBanco({ code: 'XX000', message: SEGREDO }, 'ctx');
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SEGREDO);
    expect(JSON.stringify(spy.mock.calls)).toContain('XX000');
  });
  it('null -> 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(erroDoBanco(null, 'c').status).toBe(500);
  });
});

describe('lerCorpo', () => {
  const falha = async (req: NextRequest, status: number, msg?: RegExp) => {
    const r = await lerCorpo(req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(status);
      if (msg) expect(((await r.response.json()) as { error: string }).error).toMatch(msg);
    }
  };
  it('JSON válido', async () => {
    expect(await lerCorpo(mk('{"a":1}'))).toEqual({ ok: true, body: { a: 1 } });
  });
  it('vazio -> 400', () => falha(mk(''), 400, /Corpo vazio/));
  it('sem corpo -> 400', () => falha(mk(null), 400, /Corpo vazio/));
  it('JSON inválido -> 400', () => falha(mk('{x'), 400));
  it('content-length não numérico -> 400', () => falha(mk('{}', { 'content-length': 'abc' }), 400));
  it('content-length declarado grande -> 413', () =>
    falha(mk('{}', { 'content-length': String(TAMANHO_MAXIMO_CORPO + 1) }), 413));
  it('grande sem content-length via stream -> 413 abortando', async () => {
    let enviados = 0;
    const chunk = new TextEncoder().encode('a'.repeat(4096));
    const stream = new ReadableStream({
      pull(c) {
        enviados++;
        if (enviados > 100) return c.close();
        c.enqueue(chunk);
      },
    });
    await falha(mk(stream), 413);
    expect(enviados).toBeLessThan(20);
  });
  it('content-length falso (menor que o real) ainda barra pelo stream', async () => {
    const grande = JSON.stringify({ a: 'x'.repeat(TAMANHO_MAXIMO_CORPO + 10) });
    await falha(mk(grande, { 'content-length': '10' }), 413);
  });
  it('multibyte exatamente no limite passa; +1 byte barra', async () => {
    const base = '{"a":"';
    const fim = '"}';
    const livre = TAMANHO_MAXIMO_CORPO - base.length - fim.length;
    const ok = base + 'é'.repeat(livre / 2) + fim;
    expect(Buffer.byteLength(ok)).toBe(TAMANHO_MAXIMO_CORPO);
    expect((await lerCorpo(mk(ok))).ok).toBe(true);
    await falha(mk(base + 'é'.repeat(livre / 2) + 'a' + fim), 413);
  });
  it('exceção de leitura -> 400', async () => {
    const stream = new ReadableStream({ pull(c) { c.error(new Error('boom')); } });
    await falha(mk(stream), 400, /Falha ao ler o corpo/);
  });
});
