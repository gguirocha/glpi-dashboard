import type { BoardIndicators } from "@/lib/projects/board"
import type { ReactNode } from "react"

function Tile({
    label,
    value,
    hint,
    tone = "neutral",
}: {
    label: string
    value: ReactNode
    hint?: string
    tone?: "neutral" | "danger" | "warning" | "good"
}) {
    const toneCls = {
        neutral: "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
        danger: "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800",
        warning: "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800",
        good: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    }[tone]
    const valueCls = {
        neutral: "text-slate-900 dark:text-slate-50",
        danger: "text-rose-700 dark:text-rose-300",
        warning: "text-amber-800 dark:text-amber-300",
        good: "text-emerald-700 dark:text-emerald-300",
    }[tone]
    return (
        <div className={`rounded-lg border px-3 py-2 ${toneCls}`} title={hint}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</dt>
            <dd className={`text-lg font-bold leading-tight tabular-nums ${valueCls}`}>{value}</dd>
        </div>
    )
}

const dash = "—"

export function BoardIndicatorsBar({ indicators }: { indicators: BoardIndicators }) {
    const i = indicators
    return (
        <dl
            aria-label="Indicadores do portfólio"
            className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 mb-5"
        >
            <Tile
                label="Em andamento"
                tone={i.wipExcedido ? "danger" : "neutral"}
                hint={i.wipExcedido
                    ? `Limite de projetos simultâneos (${i.wipLimit}) excedido`
                    : "Projetos em Execução, Segurança ou Homologação / limite WIP"}
                value={
                    <span>
                        {i.emAndamento}
                        <span className="text-sm font-semibold opacity-80"> / {i.wipLimit}</span>
                        {i.wipExcedido && <span className="ml-1 text-xs font-semibold">acima do limite</span>}
                    </span>
                }
            />
            <Tile
                label="Atrasados"
                tone={i.atrasados > 0 ? "danger" : "neutral"}
                hint="Em andamento com previsto vencido ou acima do prometido"
                value={i.atrasados}
            />
            <Tile label="Bloqueados" tone={i.bloqueados > 0 ? "warning" : "neutral"} value={i.bloqueados} />
            <Tile
                label="Aguardando retorno"
                tone={i.aguardandoRetorno > 0 ? "warning" : "neutral"}
                value={i.aguardandoRetorno}
            />
            <Tile label="Entregues no mês" tone="good" value={i.entreguesNoMes} />
            <Tile
                label="No prazo"
                hint="Entregues no mês dentro do prazo prometido (só os que têm prometido)"
                value={i.noPrazoPct === null ? dash : `${i.noPrazoPct}%`}
            />
            <Tile
                label="Lead time médio"
                hint="Início → encerramento, encerrados nos últimos 90 dias"
                value={i.leadTimeMedioDias === null ? dash : `${i.leadTimeMedioDias} d`}
            />
        </dl>
    )
}
