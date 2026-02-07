"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/context/AuthContext"
import { useRouter } from "next/navigation"
import { Ticket } from "@/types"
import { KPICard } from "./KPICard"
import { ProjectBoard } from "./ProjectBoard"
import { BarChart3, Clock, CheckCircle, AlertCircle, TrendingUp, Users, MapPin, Layers, Calendar, AlertTriangle, UserPlus, LogOut, ChevronDown, User as UserIcon, X, Search, Filter, RefreshCw } from "lucide-react"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from "recharts"
import { format, subDays, subMonths, subYears, differenceInDays, isWithinInterval, parseISO, startOfDay, endOfDay, startOfMonth, endOfMonth, formatDistance } from "date-fns"
import { ptBR } from "date-fns/locale"

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
    const { user, profile, isAdmin, isLoading: authLoading, signOut } = useAuth();
    const router = useRouter();

    // Auth Protection
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);


    // As it already is, no change is strictly necessary based on the provided input.
    // If there were specific new hooks to add, they were not clearly provided.
    // Given the prompt to make the change faithfully and without unrelated edits,
    // and the "Code Edit" section being syntactically incorrect if inserted directly,
    // I will return the original code as no valid, new code to insert was provided.

    const [tickets, setTickets] = useState<Ticket[]>([])
    const [previousTickets, setPreviousTickets] = useState<Ticket[]>([])
    const [loading, setLoading] = useState(true)
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"))
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"))

    // Refresh Timer & Goals State
    const [timeLeft, setTimeLeft] = useState(300);
    const [goals, setGoals] = useState({ sla: 90, fcr: 80, time: 4 });
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('dashboard_goals');
        if (saved) {
            try { setGoals(JSON.parse(saved)); } catch (e) { console.error("Error parsing goals", e); }
        }
    }, []);

    const updateGoal = (key: string, val: number) => {
        const newGoals = { ...goals, [key]: val };
        setGoals(newGoals);
        localStorage.setItem('dashboard_goals', JSON.stringify(newGoals));
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    fetchTickets();
                    return 300;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [startDate, endDate]);

    const formatTimeLeft = () => {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        fetchTickets()
    }, [startDate, endDate])

    async function fetchTickets() {
        setLoading(true)
        try {
            // 1. Current Period
            const currentReq = supabase
                .from('dashboard_tickets')
                .select('*')
                .gte('date_creation', `${startDate}T00:00:00`)
                .lte('date_creation', `${endDate}T23:59:59`)

            // 2. Comparison Period logic
            // 2. Comparison Period logic
            const start = parseISO(startDate)
            const end = parseISO(endDate)

            // Validate dates manually typed by user
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                // Stop fetching if dates are invalid to prevent crash
                setLoading(false)
                return
            }

            // Logic: ALWAYS compare against the FULL previous month relative to the start date
            // Example: Start 01/01/2026 -> Compare with Full Dec 2025 (01/12/2025 - 31/12/2025)
            // Example: Start 05/02/2026 -> Compare with Full Jan 2026 (01/01/2026 - 31/01/2026)

            const prevMonthDate = subMonths(start, 1)
            const prevStart = startOfMonth(prevMonthDate)
            const prevEnd = endOfMonth(prevMonthDate)

            const formattedPrevStart = format(prevStart, "yyyy-MM-dd")
            const formattedPrevEnd = format(prevEnd, "yyyy-MM-dd")

            const prevReq = supabase
                .from('dashboard_tickets')
                .select('*')
                .gte('date_creation', `${formattedPrevStart}T00:00:00`)
                .lte('date_creation', `${formattedPrevEnd}T23:59:59`)

            const [currRes, prevRes] = await Promise.all([currentReq, prevReq])

            if (currRes.error) throw currRes.error
            if (prevRes.error) throw prevRes.error

            if (currRes.data) setTickets(currRes.data as unknown as Ticket[])
            if (prevRes.data) setPreviousTickets(prevRes.data as unknown as Ticket[])

        } catch (err) {
            console.error("Error fetching tickets:", err)
        } finally {
            setLoading(false)
        }
    }

    // --- KPI CALCULATIONS ---
    const totalTickets = tickets.length
    const prevTotalTickets = previousTickets.length

    const ticketGrowth = prevTotalTickets > 0
        ? ((totalTickets - prevTotalTickets) / prevTotalTickets) * 100
        : 0

    const ticketTrendLabel = `${ticketGrowth > 0 ? '+' : ''}${ticketGrowth.toFixed(1)}% vs mês anterior`

    // 1. Status Overview
    const statusCounts = tickets.reduce((acc, t) => {
        acc[t.status_label] = (acc[t.status_label] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    const statusData = Object.entries(statusCounts).map(([name, value]) => {
        const pct = totalTickets > 0 ? ((value / totalTickets) * 100).toFixed(1) : "0.0"
        return {
            name: `${name} (${pct}%)`,
            value
        }
    })

    const closedTickets = (statusCounts['Solved'] || 0) + (statusCounts['Closed'] || 0)

    // 2. FCR (First Call Resolution)
    // Logic: Tickets Solved/Closed AND (Followups <= 1 [flagged from backend])
    const fcrCount = tickets.filter(t => (t.status_label === 'Solved' || t.status_label === 'Closed') && t.count_cless_one_hour).length
    const fcrRate = closedTickets > 0 ? ((fcrCount / closedTickets) * 100).toFixed(1) : "0"

    // 3. SLA Compliance
    const slaViolated = tickets.filter(t => t.is_sla_violated).length
    const slaComplianceRate = totalTickets > 0 ? (((totalTickets - slaViolated) / totalTickets) * 100).toFixed(1) : 0

    // 4. Avg Resolution Time by Priority
    const priorityGroups = tickets.reduce((acc, t) => {
        if (!acc[t.priority_label]) acc[t.priority_label] = { total: 0, count: 0 }
        if (t.time_to_resolve > 0) {
            acc[t.priority_label].total += t.time_to_resolve
        }
        // Always count for percentage even if time_to_resolve is 0 (though avg requires time)
        // Actually typically we want % of total volume.
        acc[t.priority_label].count += 1
        return acc
    }, {} as Record<string, { total: number, count: number }>)

    const avgTimeByPriority = Object.keys(priorityGroups).map(p => {
        const count = priorityGroups[p].count
        const pct = totalTickets > 0 ? ((count / totalTickets) * 100).toFixed(1) : "0.0"
        return {
            name: `${p} (${pct}%)`, // Append % to name
            hours: count > 0 && priorityGroups[p].total > 0 ? (priorityGroups[p].total / count / 3600).toFixed(1) : 0
        }
    })

    // 5. Top Categories
    const categoryCounts = tickets.reduce((acc, t) => {
        const cat = t.category_name || 'Sem Categoria'
        acc[cat] = (acc[cat] || 0) + 1
        return acc
    }, {} as Record<string, number>)
    const topCategories = Object.entries(categoryCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, value]) => ({ name, value }))

    // 6. Top Departments
    const deptCounts = tickets.reduce((acc, t) => {
        const dept = t.department_name || 'Desconhecido'
        acc[dept] = (acc[dept] || 0) + 1
        return acc
    }, {} as Record<string, number>)
    const topDepartments = Object.entries(deptCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, value]) => {
            const pct = totalTickets > 0 ? ((value / totalTickets) * 100).toFixed(1) : "0.0"
            return {
                name: `${name} (${pct}%)`,
                value
            }
        })

    // 7. Location
    const locationCounts = tickets.reduce((acc, t) => {
        const loc = t.location_name || 'Desconhecido'
        acc[loc] = (acc[loc] || 0) + 1
        return acc
    }, {} as Record<string, number>)
    const byLocation = Object.entries(locationCounts)
        .map(([name, value]) => {
            const pct = totalTickets > 0 ? ((value / totalTickets) * 100).toFixed(1) : "0.0"
            return {
                name: `${name} (${pct}%)`,
                value
            }
        })

    // 8. Trend (Daily)
    const dailyTrend = tickets.reduce((acc, t) => {
        const date = t.date_creation.split('T')[0]
        acc[date] = (acc[date] || 0) + 1
        return acc
    }, {} as Record<string, number>)
    const trendData = Object.entries(dailyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }))

    // --- OVERDUE TICKETS LOGIC (Independent of Date Filter) ---
    // We need to fetch this separately because the main 'tickets' state is filtered by date.
    const [overdueCount, setOverdueCount] = useState(0);
    const [oldestOverdueTime, setOldestOverdueTime] = useState("");

    useEffect(() => {
        const fetchOverdue = async () => {
            const nowIso = new Date().toISOString();

            // Query: Not Solved (5) or Closed (6), AND sla_time_limit < NOW
            const { data, error } = await supabase
                .from('dashboard_tickets')
                .select('sla_time_limit')
                .not('status_id', 'in', '(5,6)') // Open tickets only
                .lt('sla_time_limit', nowIso)    // Past deadline
                .order('sla_time_limit', { ascending: true }); // Oldest first

            if (data && !error) {
                setOverdueCount(data.length);
                if (data.length > 0 && data[0].sla_time_limit) {
                    const oldestDate = new Date(data[0].sla_time_limit);
                    const timeDiff = formatDistance(oldestDate, new Date(), { locale: ptBR });
                    setOldestOverdueTime(`O chamado mais antigo está vencido há ${timeDiff}`);
                }
            }
        };

        fetchOverdue();
        // Poll every 5 minutes to keep this specific counter fresh too
        const interval = setInterval(fetchOverdue, 300000);
        return () => clearInterval(interval);
    }, []); // Empty dependency array = runs on mount and then independent of date filters

    // --- ALERT SYSTEM ---
    const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string; type: 'warning' | 'error' }>({
        visible: false, title: "", message: "", type: "warning"
    });
    const lastNearBreachAlert = useState(0); // Timestamp
    const lastExcessiveOverdueAlert = useState(0); // Timestamp
    // Using refs for timestamps to avoid re-renders impacting logic, but useState is fine for simple intervals. 
    // Actually refs are better for timers.
    const lastAlertRefs = {
        nearBreach: 0,
        excessiveOverdue: 0
    };
    // We need state to force re-render if we want to show/hide, but refs for checking logic safely.
    // Let's rely on standard variables outside component or refs inside.
    const alertTimers = useState<{ near: number, excessive: number }>({ near: 0, excessive: 0 }); // Using state to persist? No, refs are better.

    // SOUND - Base64 simple alarm beep
    const playAlarm = () => {
        try {
            // Simple Beep Sound Data URI (Short Beep)
            const audioData = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU7/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//n/+f/5//s=";
            const audio = new Audio(audioData);
            audio.loop = true;
            audio.play().catch(e => console.log("Audio play failed (user interaction needed):", e));

            setTimeout(() => {
                audio.pause();
                audio.currentTime = 0;
            }, 4000);
        } catch (e) { console.error("Sound error", e); }
    };

    useEffect(() => {
        const checkAlerts = () => {
            const now = Date.now();
            const nowObj = new Date();

            // 1. Check Excessive Overdue ( > 5 ) - Every 30 min (1800000 ms)
            if (overdueCount > 5) {
                if (now - alertTimers[0].excessive > 1800000) {
                    setAlertConfig({
                        visible: true,
                        title: "ALERTA CRÍTICO",
                        message: `Quantidade excessiva de chamados vencidos (${overdueCount}). Atuação Imediata Necessária!`,
                        type: "error"
                    });
                    playAlarm();
                    alertTimers[1](prev => ({ ...prev, excessive: now }));

                    // Auto hide after 4s
                    setTimeout(() => setAlertConfig(prev => ({ ...prev, visible: false })), 4000);
                    return; // Prioritize this alert
                }
            }

            // 2. Check Near Breach ( < 2h ) - Every 20 min (1200000 ms)
            // Filter tickets: Open AND (sla_time_limit > now AND sla_time_limit < now + 2h)
            const twoHoursFromNow = new Date(nowObj.getTime() + 2 * 60 * 60 * 1000);
            const nearBreachTickets = tickets.filter(t =>
                !t.date_solved &&
                t.status_id !== 5 && t.status_id !== 6 &&
                t.sla_time_limit &&
                new Date(t.sla_time_limit) > nowObj &&
                new Date(t.sla_time_limit) <= twoHoursFromNow
            );

            if (nearBreachTickets.length > 0) {
                if (now - alertTimers[0].near > 1200000) {
                    setAlertConfig({
                        visible: true,
                        title: "ATENÇÃO: VENCIMENTO PRÓXIMO",
                        message: `Existem ${nearBreachTickets.length} chamados prestes a vencer (2h). Verifique a fila!`,
                        type: "warning"
                    });
                    playAlarm();
                    alertTimers[1](prev => ({ ...prev, near: now }));

                    setTimeout(() => setAlertConfig(prev => ({ ...prev, visible: false })), 4000);
                }
            }
        };

        const interval = setInterval(checkAlerts, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [overdueCount, tickets, alertTimers]);

    if (loading) return <div className="p-10 text-center text-slate-500">Carregando Dados...</div>

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900 relative">
            {/* ALERT MODAL */}
            {alertConfig.visible && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-pulse">
                    <div className={`p-8 rounded-2xl shadow-2xl max-w-lg text-center transform scale-110 transition-transform ${alertConfig.type === 'error' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                        }`}>
                        <AlertTriangle className="w-16 h-16 mx-auto mb-4" />
                        <h2 className="text-4xl font-black mb-2 uppercase">{alertConfig.title}</h2>
                        <p className="text-xl font-bold">{alertConfig.message}</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard de TI</h1>
                    <div className="flex items-center space-x-2 mt-1">
                        <p className="text-slate-500">Indicadores de Desempenho GLPI</p>
                        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            Atualiza em {formatTimeLeft()}
                        </span>
                    </div>
                </div>

                {/* Date Filter */}
                <div className="flex items-center space-x-4">
                    {/* User Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                        >
                            <div className="bg-indigo-100 p-1 rounded-full">
                                <UserIcon className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="text-left hidden sm:block">
                                <p className="text-xs font-bold text-slate-700 leading-none">{profile?.full_name || user?.email?.split('@')[0]}</p>
                                <p className="text-sm text-slate-400 leading-none uppercase scale-75 origin-left mt-0.5">{profile?.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
                            </div>
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                        </button>

                        {userMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                                {isAdmin && (
                                    <button
                                        onClick={() => router.push('/admin/users')}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center"
                                    >
                                        <UserPlus className="w-4 h-4 mr-2 text-indigo-600" />
                                        Cadastrar Usuários
                                    </button>
                                )}
                                <div className="h-px bg-slate-100 my-1"></div>
                                <button
                                    onClick={() => signOut()}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                                >
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Sair do Sistema
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Date Filter */}
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="text-sm border-none focus:ring-0 text-slate-600 outline-none"
                        />
                        <span className="text-slate-300">-</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="text-sm border-none focus:ring-0 text-slate-600 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* New Overdue Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Chamados Vencidos (Aberto)</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{overdueCount}</h3>
                        </div>
                        <div className={`p-2 rounded-lg ${overdueCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                            <AlertTriangle className={`w-5 h-5 ${overdueCount > 0 ? 'text-red-500' : 'text-green-500'}`} />
                        </div>
                    </div>
                    {overdueCount > 0 ? (
                        <div className="flex items-center text-xs text-red-600 font-medium bg-red-50 p-2 rounded-md">
                            <Clock className="w-3 h-3 mr-1" />
                            {oldestOverdueTime}
                        </div>
                    ) : (
                        <div className="text-xs text-green-600 font-medium">Tudo em dia!</div>
                    )}
                </div>

                <KPICard
                    title="Total de Chamados"
                    value={totalTickets}
                    icon={Layers}
                    trend={ticketTrendLabel}
                    trendUp={ticketGrowth >= 0}
                />
                <KPICard
                    title="Conformidade SLA"
                    value={`${slaComplianceRate}%`}
                    icon={CheckCircle}
                    goalValue={goals.sla}
                    onGoalChange={(val) => updateGoal('sla', val)}
                    suffix="%"
                />
                <KPICard
                    title="Resolução 1º Nível (FCR)"
                    value={`${fcrRate}%`}
                    icon={TrendingUp}
                    description="Resolvido c/ 1 acomp. ou menos"
                    goalValue={goals.fcr}
                    onGoalChange={(val) => updateGoal('fcr', val)}
                    suffix="%"
                />
                <KPICard
                    title="Tempo Médio Resolução"
                    value={`${(avgTimeByPriority.reduce((acc, i) => acc + Number(i.hours), 0) / (avgTimeByPriority.length || 1)).toFixed(1)}h`}
                    icon={Clock}
                    goalValue={goals.time}
                    onGoalChange={(val) => updateGoal('time', val)}
                    isTime={true}
                    suffix="h"
                />
            </div>

            {/* Main Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

                {/* Ticket Evolution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-semibold mb-6 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-indigo-500" />
                        Evolução do Volume de Chamados
                    </h3>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} />
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Breakdown */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-semibold mb-6 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2 text-indigo-500" />
                        Visão Geral por Status
                    </h3>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Secondary Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Top Categories */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1">
                    <h3 className="text-lg font-semibold mb-4">Principais Categorias</h3>
                    <div className="space-y-4">
                        {topCategories.map((cat, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <span className="text-sm text-slate-600 truncate max-w-[70%]" title={cat.name}>{cat.name}</span>
                                <div className="flex items-center">
                                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden mr-3">
                                        <div className="h-full bg-indigo-500" style={{ width: `${(cat.value / totalTickets) * 100}%` }}></div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">{cat.value}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Avg Resolution by Priority */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-2">
                    <h3 className="text-lg font-semibold mb-6">Tempo Médio Resolução (Horas) por Prioridade</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={avgTimeByPriority} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                <RechartsTooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="hours" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* By Location */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-semibold mb-6 flex items-center">
                        <MapPin className="w-5 h-5 mr-2 text-indigo-500" />
                        Chamados por Localização
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byLocation}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis />
                                <RechartsTooltip />
                                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Departments */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-semibold mb-6 flex items-center">
                        <Users className="w-5 h-5 mr-2 text-indigo-500" />
                        Chamados por Departamento
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topDepartments} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                                <RechartsTooltip />
                                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            {/* Department Projects */}
            <ProjectBoard />
        </div>
    )
}
