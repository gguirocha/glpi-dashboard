"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Lock, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: "" });
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    // const supabase = createClientComponentClient(); -> Removed, using shared instance

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setStatus({ type: null, message: "" });

        if (password !== confirmPassword) {
            setStatus({ type: 'error', message: "As senhas não coincidem." });
            setIsLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setStatus({ type: 'success', message: "Senha atualizada com sucesso! Redirecionando..." });
            setTimeout(() => {
                router.push("/login");
            }, 3000);
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message || "Erro ao atualizar senha." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 sm:rounded-2xl sm:px-10 border border-slate-100">
                    <div className="text-center mb-8">
                        <div className="bg-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                            <Lock className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">Nova Senha</h2>
                        <p className="text-slate-500 mt-2 text-sm">Digite sua nova senha abaixo</p>
                    </div>

                    {status.message && (
                        <div className={`mb-6 p-4 rounded-xl flex items-start text-sm ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {status.type === 'success' ? <CheckCircle className="w-5 h-5 mr-2 shrink-0" /> : <AlertCircle className="w-5 h-5 mr-2 shrink-0" />}
                            <span>{status.message}</span>
                        </div>
                    )}

                    <form onSubmit={handleReset} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-1.5">Nova Senha</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-900 font-medium"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-1.5">Confirmar Senha</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-900 font-medium"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Atualizar Senha"}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link href="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                            Voltar para Login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
