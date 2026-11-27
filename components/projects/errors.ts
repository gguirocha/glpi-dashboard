type PgError = { message?: string; code?: string; details?: string; hint?: string }

export const CONFLICT_MESSAGE = "Este projeto foi alterado por outra pessoa — recarregue."

export function errorCode(err: unknown): string | undefined {
    return typeof err === "object" && err !== null ? (err as PgError).code : undefined
}

/**
 * Erro do PostgREST/rede -> frase genérica para o usuário (nunca a mensagem crua do banco).
 * O detalhe técnico vai só para o console.
 */
export function describeError(err: unknown, context: string): string {
    const e = (typeof err === "object" && err !== null ? err : {}) as PgError
    console.error(`${context}:`, { message: e.message, code: e.code, details: e.details, hint: e.hint })
    switch (e.code) {
        case "23503":
            return "Projeto com histórico não pode ser apagado — encerre-o."
        case "42501":
            return e.message?.includes("prometido")
                ? "O prazo prometido só muda pela API, com registro de mudança."
                : "Permissão negada pelo banco."
        case "23505":
            return "Já existe um registro com esse nome."
        case "23514":
        case "22001":
        case "22P02":
            return "Valor recusado pelo banco (confira tamanhos e formatos)."
        case "PGRST116":
            return "Projeto não encontrado (pode ter sido apagado). Recarregue a página."
        case "PGRST301":
        case "401":
            return "Sessão expirada. Entre de novo."
        default:
            return "Não foi possível falar com o banco. Tente de novo."
    }
}
