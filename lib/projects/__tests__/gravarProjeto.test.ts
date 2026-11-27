import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { gravarProjeto } from '../apiRoute';

describe('gravarProjeto', () => {
  it('chama a rpc api_write_project com os parâmetros mapeados e devolve o resultado', async () => {
    const resultado = { data: { id: 1 }, error: null };
    const rpc = vi.fn().mockResolvedValue(resultado);
    const admin = { rpc } as unknown as SupabaseClient;
    const out = await gravarProjeto(admin, {
      id: 12,
      project: { title: 'T' },
      event: { kind: 'g2', summary: 'S' },
      author: 'Bia',
      keyId: 3,
    });
    expect(out).toBe(resultado);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('api_write_project', {
      p_id: 12,
      p_project: { title: 'T' },
      p_event: { kind: 'g2', summary: 'S' },
      p_author: 'Bia',
      p_key_id: 3,
    });
  });

  it('criação: id e evento nulos seguem como null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await gravarProjeto({ rpc } as unknown as SupabaseClient, {
      id: null, project: { title: 'T' }, event: null, author: 'Bia', keyId: 3,
    });
    const args = rpc.mock.calls[0][1];
    expect(args.p_id).toBeNull();
    expect(args.p_event).toBeNull();
  });

  it('propaga o erro do banco sem tratá-lo', async () => {
    const erro = { code: 'P0002', message: 'x' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: erro });
    const out = await gravarProjeto({ rpc } as unknown as SupabaseClient, {
      id: 1, project: {}, event: null, author: 'a', keyId: 1,
    });
    expect(out.error).toBe(erro);
  });
});
