import dynamic from "next/dynamic"
import { notFound } from "next/navigation"

// No build de produção NODE_ENV é constante: o ramo do import() some e os dados de exemplo
// não entram em nenhum bundle.
const QuadroDevClient =
    process.env.NODE_ENV === "production"
        ? null
        : dynamic(() => import("./QuadroDevClient").then((m) => m.QuadroDevClient))

/** Vitrine do Quadro de Projetos v2 com dados fixos — só em desenvolvimento, sem Supabase. */
export default function QuadroDevPage() {
    if (!QuadroDevClient) notFound()
    return (
        <main className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 sm:p-8">
            <p className="mb-4 text-xs text-slate-600 dark:text-slate-400">
                Página de desenvolvimento — dados de exemplo em memória; nada é gravado.
            </p>
            <QuadroDevClient />
        </main>
    )
}
