"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Network,
  Plus,
  Trash2,
  Activity,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface NetworkLink {
  id: string;
  name: string;
  ip_address: string;
  last_status: "up" | "down" | "unknown";
  last_checked: string;
}

interface NetworkEvent {
  id: string;
  link_id: string;
  status: "up" | "down";
  created_at: string;
}

interface NetworkMonitorProps {
  startDate: string;
  endDate: string;
}

export function NetworkMonitor({ startDate, endDate }: NetworkMonitorProps) {
  const [links, setLinks] = useState<NetworkLink[]>([]);
  const [availabilityData, setAvailabilityData] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Auto Refresh Data
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // 1 minute auto refresh
    return () => clearInterval(interval);
  }, [startDate, endDate]);

  const fetchData = async () => {
    try {
      // 1. Get Links
      const { data: linksData, error: linksError } = await supabase
        .from("network_links")
        .select("*")
        .order("created_at", { ascending: true });

      if (linksError) throw linksError;
      setLinks(linksData || []);

      if (!linksData || linksData.length === 0) {
        setAvailabilityData([]);
        return;
      }

      // 2. Compute Availability % using events
      // Setup start and end dates natively based on Dashboard's filter
      let filterStart = new Date();
      if (startDate === "current_month") {
        filterStart = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        );
      } else if (startDate === "last_month") {
        filterStart = new Date(
          new Date().getFullYear(),
          new Date().getMonth() - 1,
          1,
        );
      } else if (startDate) {
        filterStart = new Date(startDate);
      }

      let filterEnd = endDate ? new Date(endDate) : new Date();
      filterEnd.setHours(23, 59, 59, 999);

      // We need events from a bit before the start date to know the initial state
      // But for simplicity, we query events in the period
      const { data: eventsData, error: eventsError } = await supabase
        .from("network_events")
        .select("*")
        .in(
          "link_id",
          linksData.map((l) => l.id),
        )
        .lt("created_at", filterEnd.toISOString())
        .order("created_at", { ascending: true });

      if (eventsError) throw eventsError;

      const chartData = linksData.map((link) => {
        const linkEvents =
          eventsData?.filter((e) => e.link_id === link.id) || [];

        let totalDowntimeMs = 0;
        let lastDownTime: Date | null = null;

        // Very basic availability calc: assuming period starts UP unless specified
        // Best approach: Walk through events and count time spent in 'down' state
        linkEvents.forEach((evt) => {
          const eventTime = new Date(evt.created_at);
          // If event is before our period, we just track state
          if (evt.status === "down") {
            lastDownTime = eventTime;
          } else if (evt.status === "up") {
            if (lastDownTime) {
              // Time was restored. How much downtime?
              const downStart =
                (lastDownTime as Date) < filterStart ? filterStart : (lastDownTime as Date);
              const upTime = eventTime > filterEnd ? filterEnd : eventTime;

              if (upTime > downStart) {
                totalDowntimeMs += upTime.getTime() - downStart.getTime();
              }
              lastDownTime = null;
            }
          }
        });

        // If it was still down at the end of the evaluated period (or currently down)
        if (lastDownTime) {
          const downStart =
            (lastDownTime as Date) < filterStart ? filterStart : (lastDownTime as Date);
          const upTime = new Date() > filterEnd ? filterEnd : new Date();
          if (upTime > downStart) {
            totalDowntimeMs += upTime.getTime() - downStart.getTime();
          }
        }

        const totalPeriodMs = filterEnd.getTime() - filterStart.getTime();
        // Prevent negative or over 100
        const periodMsClamped = Math.max(totalPeriodMs, 1000);
        let availability = 100 - (totalDowntimeMs / periodMsClamped) * 100;

        // Safeguards
        if (availability < 0) availability = 0;
        if (availability > 100) availability = 100;

        // If there are zero events and link is new, it's 100%. If it's down right now and zero events? 0%.
        if (linkEvents.length === 0 && link.last_status === "down") {
          availability = 0;
        }

        return {
          name: link.name,
          Disponibilidade: Number(availability.toFixed(2)),
          status: link.last_status,
        };
      });

      setAvailabilityData(chartData);
    } catch (e) {
      console.error("Network Fetch Error", e);
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newIp) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from("network_links")
        .insert([{ name: newName, ip_address: newIp, last_status: "unknown" }]);

      if (error) throw error;

      setNewName("");
      setNewIp("");
      setIsAdding(false);

      // Re-fetch
      fetchData();
      // Directly call ping to populate immediately
      fetch("/api/cron/ping").catch(console.error);
    } catch (e) {
      console.error("Error adding link", e);
      alert("Erro ao adicionar Link");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este link? O histórico será perdido.")) return;
    try {
      const { error } = await supabase
        .from("network_links")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (e) {
      console.error(e);
      alert("Erro ao deletar");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-500 pb-8">
      {/* 1. IPS Config Card */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold flex items-center text-slate-800 dark:text-slate-100">
            <Network className="w-5 h-5 mr-2 text-indigo-500" />
            Links de Internet Ativos
          </h3>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 py-1.5 px-3 rounded-md flex items-center transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            Adicionar IP
          </button>
        </div>

        {isAdding && (
          <form
            onSubmit={handleAddLink}
            className="flex gap-2 mb-6 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700"
          >
            <input
              required
              type="text"
              placeholder="Nome (Ex: Link Embratel)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 text-sm p-2 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800 focus:outline-indigo-500"
            />
            <input
              required
              type="text"
              placeholder="IP alvo (Ex: 8.8.8.8)"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              className="w-32 text-sm p-2 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800 focus:outline-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 text-sm rounded transition-colors disabled:opacity-50"
            >
              Salvar
            </button>
          </form>
        )}

        <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
          {links.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              Nenhum link configurado.
            </p>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-lg"
              >
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-3 ${link.last_status === "up" ? "bg-green-500 animate-pulse" : link.last_status === "down" ? "bg-red-500" : "bg-slate-400"}`}
                    title={link.last_status === "up" ? "Online" : link.last_status === "down" ? "Offline" : "Desconhecido"}
                  />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {link.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {link.ip_address}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${link.last_status === "up" ? "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30" : link.last_status === "down" ? "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30" : "text-slate-600 bg-slate-200 dark:text-slate-400 dark:bg-slate-800"}`}
                  >
                    {link.last_status === "up" ? "Online" : link.last_status === "down" ? "Offline" : "Desconhecido"}
                  </span>
                  <button
                    onClick={() => handleDelete(link.id)}
                    className="text-red-400 hover:text-red-600 transition-colors p-1"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Availability Chart */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <h3 className="text-lg font-semibold flex items-center mb-6 text-slate-800 dark:text-slate-100">
          <Activity className="w-5 h-5 mr-2 text-indigo-500" />
          Disponibilidade (%) por Link
        </h3>
        {availabilityData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Activity className="w-12 h-12 mb-2 opacity-20" />
            <p>Aguardando dados estruturais...</p>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={availabilityData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: any) => [
                    `${value}%`,
                    "Disponibilidade",
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  cursor={{ fill: "#f1f5f9", opacity: 0.1 }}
                />
                <Bar
                  dataKey="Disponibilidade"
                  radius={[4, 4, 0, 0]}
                  barSize={40}
                >
                  {availabilityData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.Disponibilidade >= 99
                          ? "#10b981"
                          : entry.Disponibilidade >= 90
                            ? "#f59e0b"
                            : "#ef4444"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
