"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Mail, ArrowLeft, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (error) {
                setError(error.message);
            } else {
                setSuccess(true);
            }
        } catch (err) {
            setError("Ocorreu um erro inesperado.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
                <Link href="/login" className="flex items-center text-sm text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Voltar para Login
                </Link>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-900">Recuperar Senha</h1>
                    <p className="text-slate-500 text-sm mt-2">Informe seu email para receber as instruções de recuperação.</p>
                </div>

                {success ? (
                    <div className="bg-green-50 text-green-700 p-6 rounded-xl text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                        <h3 className="font-semibold mb-1">Verifique seu Email</h3>
                        <p className="text-sm">Enviamos um link de recuperação para <strong>{email}</strong>.</p>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-5">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start">
                                <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                    placeholder="seu@email.com"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-all shadow-md shadow-indigo-100 disabled:opacity-70 flex items-center justify-center"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enviar Link de Recuperação"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
