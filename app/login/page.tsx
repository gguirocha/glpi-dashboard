"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let loginEmail = email.trim();

            // If not an email, try to find the email associated with this username
            if (!loginEmail.includes("@")) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('username', loginEmail)
                    .single();

                if (profile && profile.email) {
                    loginEmail = profile.email;
                    // console.log("System Login: Resolved username", email, "to", loginEmail);
                } else {
                    // Fallback for "admin" or legacy users without custom emails
                    loginEmail = `${loginEmail}@glpi.local`;
                }
            }

            const { error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (error) {
                setError(error.message === "Invalid login credentials"
                    ? "Email ou senha incorretos."
                    : error.message);
            } else {
                router.push("/");
            }
        } catch (err) {
            setError("Ocorreu um erro inesperado. Tente novamente.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
                <div className="text-center mb-8">
                    <div className="bg-indigo-600 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                        <Lock className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Acesso Restrito</h1>
                    <p className="text-slate-500 text-sm mt-2">Dashboard de Indicadores GLPI</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 flex items-start">
                        <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-slate-900 mb-1.5">Usuário ou Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-900 font-medium"
                                placeholder="admin ou seu@email.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-bold text-slate-900">Senha</label>
                            <Link href="/forgot-password" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                                Esqueceu a senha?
                            </Link>
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-all shadow-md shadow-indigo-100 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar no Sistema"}
                    </button>
                </form>
            </div>
        </div>
    );
}
