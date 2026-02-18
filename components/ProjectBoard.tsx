"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Project } from "@/types"
import { Plus, X, ArrowRight, ArrowLeft } from "lucide-react"

export function ProjectBoard() {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [newProject, setNewProject] = useState("")
    const [isAdding, setIsAdding] = useState(false)

    useEffect(() => {
        fetchProjects()
    }, [])

    async function fetchProjects() {
        try {
            const { data, error } = await supabase
                .from('dashboard_projects')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            if (data) setProjects(data as Project[])
        } catch (error) {
            console.error("Error fetching projects:", error)
        } finally {
            setLoading(false)
        }
    }

    async function addProject(status: 'todo' | 'in_progress' | 'done' = 'todo') {
        if (!newProject.trim()) return

        try {
            const { data, error } = await supabase
                .from('dashboard_projects')
                .insert([{ title: newProject, status }])
                .select()

            if (error) throw error
            if (data) {
                setProjects([data[0] as Project, ...projects])
                setNewProject("")
                setIsAdding(false)
            }
        } catch (error) {
            console.error("Error adding project:", error)
        }
    }

    async function deleteProject(id: number) {
        try {
            const { error } = await supabase
                .from('dashboard_projects')
                .delete()
                .eq('id', id)

            if (error) throw error
            setProjects(projects.filter(p => p.id !== id))
        } catch (error) {
            console.error("Error deleting project:", error)
        }
    }

    async function moveProject(project: Project, direction: 'next' | 'prev') {
        const flow = ['todo', 'in_progress', 'done']
        const currentIndex = flow.indexOf(project.status)
        const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

        if (nextIndex < 0 || nextIndex >= flow.length) return

        const newStatus = flow[nextIndex] as 'todo' | 'in_progress' | 'done'

        // Logic for completion date
        let updates: any = { status: newStatus }

        if (newStatus === 'done') {
            updates.completed_at = new Date().toISOString()
        } else if (project.status === 'done') {
            updates.completed_at = null
        }

        try {
            const { error } = await supabase
                .from('dashboard_projects')
                .update(updates)
                .eq('id', project.id)

            if (error) throw error

            setProjects(projects.map(p =>
                p.id === project.id ? { ...p, ...updates } : p
            ))
        } catch (error) {
            console.error("Error updating project:", error)
        }
    }

    const columns = [
        { id: 'todo', title: 'Ações a serem Realizadas', color: 'bg-slate-100 border-slate-200' },
        { id: 'in_progress', title: 'Em Andamento', color: 'bg-blue-50 border-blue-100' },
        { id: 'done', title: 'Ações Realizadas', color: 'bg-emerald-50 border-emerald-100' }
    ]

    if (loading) return <div className="text-center py-4 text-slate-400">Carregando quadro...</div>

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center justify-between">
                <span>Gestão de Projetos do Departamento</span>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 flex items-center transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-1" /> Novo Projeto
                    </button>
                )}
            </h3>

            {isAdding && (
                <div className="mb-6 flex gap-2">
                    <input
                        type="text"
                        value={newProject}
                        onChange={(e) => setNewProject(e.target.value)}
                        placeholder="Nome do projeto..."
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && addProject()}
                        autoFocus
                    />
                    <button
                        onClick={() => addProject()}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                        Adicionar
                    </button>
                    <button
                        onClick={() => setIsAdding(false)}
                        className="text-slate-500 px-3 py-2 hover:bg-slate-100 rounded-lg"
                    >
                        Cancelar
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {columns.map(col => (
                    <div key={col.id} className={`rounded-xl p-4 border ${col.color} min-h-[300px]`}>
                        <h4 className="font-semibold text-slate-700 mb-4 flex items-center justify-between">
                            {col.title}
                            <span className="bg-white px-2 py-0.5 rounded-full text-xs text-slate-500 border border-slate-200">
                                {projects.filter(p => p.status === col.id).length}
                            </span>
                        </h4>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {projects.filter(p => p.status === col.id).map(project => (
                                <div key={project.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 group hover:shadow-md transition-shadow relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-sm text-slate-800 font-medium leading-tight">{project.title}</p>
                                        <button
                                            onClick={() => deleteProject(project.id)}
                                            className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 p-1 bg-white/80 rounded"
                                            title="Excluir Projeto"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {project.completed_at && project.status === 'done' && (
                                        <p className="text-xs text-emerald-600 mb-2 font-medium">
                                            Concluído em: {new Date(project.completed_at).toLocaleDateString('pt-BR')}
                                        </p>
                                    )}

                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-50">
                                        {col.id !== 'todo' ? (
                                            <button
                                                onClick={() => moveProject(project, 'prev')}
                                                className="text-slate-400 hover:text-indigo-600"
                                                title="Mover para trás"
                                            >
                                                <ArrowLeft className="w-4 h-4" />
                                            </button>
                                        ) : <div></div>}

                                        {col.id !== 'done' ? (
                                            <button
                                                onClick={() => moveProject(project, 'next')}
                                                className="text-slate-400 hover:text-indigo-600"
                                                title="Mover para frente"
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        ) : <div></div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
