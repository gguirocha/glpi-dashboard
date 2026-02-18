"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { TechnicianRanking } from "@/types"
import { Award, Info, Loader2, Trophy, Medal } from "lucide-react"

interface TechnicianRankingProps {
    startDate: string
    endDate: string
}

export function TechnicianRankingList({ startDate, endDate }: TechnicianRankingProps) {
    const [ranking, setRanking] = useState<TechnicianRanking[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchRanking()
        const interval = setInterval(fetchRanking, 300000) // 5 minutes refresh
        return () => clearInterval(interval)
    }, [startDate, endDate])

    async function fetchRanking() {
        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('get_technician_ranking', {
                start_date: `${startDate}T00:00:00`,
                end_date: `${endDate}T23:59:59`
            })

            if (error) {
                console.error("Erro ao buscar ranking:", JSON.stringify(error, null, 2))
                if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
                    console.log('Problema de sessão detectado. A função RPC pode exigir autenticação.');
                }
            } else {
                setRanking(data || [])
            }
        } catch (error) {
            console.error("Erro inesperado:", error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-6 h-full flex items-center justify-center shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 h-full flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Ranking de Atendimento
                </h3>
                <span className="text-xs font-medium text-slate-500 px-2 py-1 bg-slate-100 rounded-full">
                    Top Performance
                </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pl-4 pr-2 custom-scrollbar">
                {ranking.length === 0 ? (
                    <div className="text-center text-slate-500 py-8">
                        Nenhum dado encontrado para o período.
                    </div>
                ) : (
                    ranking.map((tech, index) => (
                        <div
                            key={tech.technician_id}
                            className={`
                                relative group p-4 rounded-lg border transition-all duration-200 hover:shadow-md
                                ${index === 0 ? 'bg-amber-50 border-amber-200' : ''}
                                ${index === 1 ? 'bg-slate-50 border-slate-200' : ''}
                                ${index === 2 ? 'bg-orange-50 border-orange-200' : ''}
                                ${index > 2 ? 'bg-white border-slate-100 hover:bg-slate-50' : ''}
                            `}
                        >
                            {/* Rank Badge */}
                            <div className="absolute -left-3 -top-3 z-10">
                                {index === 0 && <div className="bg-yellow-500 text-white font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-md border-2 border-white ring-2 ring-yellow-100">1</div>}
                                {index === 1 && <div className="bg-slate-400 text-white font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-md border-2 border-white ring-2 ring-slate-100">2</div>}
                                {index === 2 && <div className="bg-orange-400 text-white font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-md border-2 border-white ring-2 ring-orange-100">3</div>}
                                {index > 2 && <div className="bg-slate-600 text-white font-bold w-6 h-6 text-sm rounded-full flex items-center justify-center shadow-sm">{index + 1}</div>}
                            </div>

                            <div className="flex items-center justify-between pl-3 gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h4 className={`font-semibold truncate ${index <= 2 ? 'text-slate-900' : 'text-slate-700'}`}>
                                            {tech.technician_name}
                                        </h4>
                                        {/* Info Tooltip */}
                                        <div className="relative group/info shrink-0">
                                            <Info className="h-4 w-4 text-slate-400 hover:text-indigo-600 cursor-help" />
                                            <div className={`absolute left-1/2 -translate-x-1/2 w-56 bg-white border border-slate-200 p-3 rounded-lg shadow-xl text-xs z-50 hidden group-hover/info:block text-slate-700 ${index < 2 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                                                <p className="font-bold text-slate-900 mb-2 border-b border-slate-100 pb-1">Detalhes da Pontuação</p>
                                                <div className="grid grid-cols-2 gap-y-1">
                                                    <span>Média Bayes:</span>
                                                    <span className="text-right font-medium text-indigo-600">{tech.media_bayes?.toFixed(2)}</span>
                                                    <span>Fator Vol.:</span>
                                                    <span className="text-right font-medium text-indigo-600">{tech.volume_factor?.toFixed(2)}x</span>
                                                    <span>Bônus Vol.:</span>
                                                    <span className="text-right font-medium text-emerald-600">+{tech.bonus_volume}</span>
                                                </div>
                                                <div className="mt-2 pt-2 border-t border-slate-100 text-center text-slate-500 text-[10px]">
                                                    Chamados: {tech.qtd_chamados} • Ativos: {tech.qtd_atendentes_ativos}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                            {tech.qtd_chamados} Chamados
                                        </span>
                                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                                            <span className={`w-2 h-2 rounded-full ${Number(tech.pct_fora_sla) > 0.1 ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                                            {(Number(tech.pct_fora_sla) * 100).toFixed(0)}% Fora SLA
                                        </span>
                                    </div>
                                </div>

                                <div className="text-right shrink-0">
                                    <div className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                                        {tech.media_final?.toFixed(1)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                                        Score Final
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
