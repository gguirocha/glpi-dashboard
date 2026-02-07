"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, AlertCircle, CheckCircle, Shield, ArrowLeft, Edit2, Trash2, Key, Save, X } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

interface UserProfile {
    id: string;
    full_name: string | null;
    username: string | null;
    role: string;
    email: string | null;
    created_at?: string;
}

export default function AdminUsersPage() {
    const { user, profile, isAdmin, isLoading } = useAuth();
    const router = useRouter();

    // State
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    // Create / Edit Form State
    const [isEditing, setIsEditing] = useState<string | null>(null); // userId if editing
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        username: "",
        password: "",
        isAdmin: false
    });

    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isLoading && !user) router.push("/login");
        if (!isLoading && user && !isAdmin) {
            // Redirect handled by render check, but safe to push here too
        }
    }, [user, isLoading, isAdmin, router]);

    useEffect(() => {
        if (isAdmin) fetchUsers();
    }, [isAdmin]);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('full_name', { ascending: true });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error("Error fetching users:", err);
        } finally {
            setLoadingUsers(false);
        }
    };

    const resetForm = () => {
        setFormData({ fullName: "", email: "", username: "", password: "", isAdmin: false });
        setIsEditing(null);
        setStatus({ type: null, message: "" });
    };

    const handleEditClick = (user: UserProfile) => {
        setIsEditing(user.id);
        setFormData({
            fullName: user.full_name || "",
            email: user.email || "",
            username: user.username || "",
            password: "", // Don't fill password
            isAdmin: user.role === 'admin'
        });
        setStatus({ type: null, message: "" });
        // Scroll to form (top)
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus({ type: null, message: "" });

        try {
            const endpoint = isEditing ? '/api/admin/update-user' : '/api/admin/create-user';
            const payload = isEditing
                ? { userId: isEditing, password: formData.password, isAdmin: formData.isAdmin } // Update: only pwd and role/admin
                : formData; // Create: all fields

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Operação falhou");
            }

            setStatus({ type: 'success', message: isEditing ? 'Usuário atualizado com sucesso!' : `Usuário ${formData.username} criado com sucesso!` });

            if (!isEditing) {
                setFormData({ fullName: "", email: "", username: "", password: "", isAdmin: false }); // Reset on create
            } else {
                // Updated
                setFormData(prev => ({ ...prev, password: "" })); // Clear password field
            }

            fetchUsers(); // Refresh list

        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

    if (!isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
                    <Shield className="w-16 h-16 mx-auto text-red-500 mb-4" />
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Negado</h1>
                    <Link href="/" className="inline-block bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors mt-4">
                        Voltar ao Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
            <div className="max-w-5xl mx-auto">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center">
                            <UserPlus className="w-8 h-8 mr-3 text-indigo-600" />
                            Gestão de Usuários
                        </h1>
                        <p className="text-slate-500 mt-1">Gerenciamento de acesso e permissões</p>
                    </div>
                    <Link href="/" className="flex items-center text-slate-500 hover:text-slate-900 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 transition-all">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* FORM COLUMN */}
                    <div className="md:col-span-1">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-6">
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <h2 className="font-semibold text-slate-800">{isEditing ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                                {isEditing && (
                                    <button onClick={resetForm} className="text-xs text-slate-500 hover:text-red-500 flex items-center">
                                        <X className="w-3 h-3 mr-1" /> Cancelar
                                    </button>
                                )}
                            </div>

                            <div className="p-5">
                                {status.message && (
                                    <div className={`mb-4 p-3 rounded-lg flex items-start text-xs ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                        {status.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2 shrink-0" /> : <AlertCircle className="w-4 h-4 mr-2 shrink-0" />}
                                        <span>{status.message}</span>
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Nome Completo</label>
                                        <input
                                            type="text"
                                            value={formData.fullName}
                                            onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm disabled:bg-slate-50"
                                            placeholder="João da Silva"
                                            required
                                            disabled={!!isEditing} // Cannot change metadata easily via admin API yet, focus on role/pwd
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm disabled:bg-slate-50"
                                            required
                                            disabled={!!isEditing}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={formData.username}
                                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm disabled:bg-slate-50"
                                            required
                                            disabled={!!isEditing}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
                                            Senha
                                            {isEditing && <span className="text-[10px] text-slate-400 font-normal">(Deixe em branco para manter)</span>}
                                        </label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                                required={!isEditing}
                                                minLength={6}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={formData.isAdmin}
                                                onChange={e => setFormData({ ...formData, isAdmin: e.target.checked })}
                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                            />
                                            <div>
                                                <span className="block text-sm font-medium text-slate-900">Administrador</span>
                                            </div>
                                        </label>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-all shadow-md shadow-indigo-100 disabled:opacity-70 flex items-center justify-center mt-4"
                                    >
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (isEditing ? <Save className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />)}
                                        {isSubmitting ? "Processando..." : (isEditing ? "Salvar Alterações" : "Cadastrar")}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>

                    {/* LIST COLUMN */}
                    <div className="md:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                <h2 className="font-semibold text-slate-800">Usuários Cadastrados</h2>
                            </div>

                            {loadingUsers ? (
                                <div className="p-8 text-center flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {users.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500 text-sm">Nenhum usuário encontrado.</div>
                                    ) : (
                                        users.map(u => (
                                            <div key={u.id} className="p-4 hover:bg-slate-50 flex items-center justify-between transition-colors group">
                                                <div className="flex items-center space-x-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${u.role === 'admin' ? 'bg-indigo-600' : 'bg-slate-400'}`}>
                                                        {u.full_name?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-900 text-sm">{u.full_name}</p>
                                                        <div className="flex items-center space-x-2 text-xs text-slate-500">
                                                            <span>@{u.username}</span>
                                                            <span>•</span>
                                                            <span>{u.email}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {u.role === 'admin' ? 'ADMIN' : 'USER'}
                                                    </span>
                                                    <button
                                                        onClick={() => handleEditClick(u)}
                                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                                                        title="Editar"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
