import { Edit2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface KPICardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: string;
    trendUp?: boolean; // true = good (green), false = bad (red)
    className?: string;

    // Goal Props
    goalValue?: number;
    onGoalChange?: (val: number) => void;
    isTime?: boolean; // If true, Lower is better. If false, Higher is better.
    suffix?: string; // e.g. "%" or "h"
}

export function KPICard({ title, value, description, icon: Icon, trend, trendUp, className, goalValue, onGoalChange, isTime, suffix }: KPICardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempGoal, setTempGoal] = useState(goalValue?.toString() || "");

    const handleSave = () => {
        if (onGoalChange && tempGoal) {
            onGoalChange(parseFloat(tempGoal));
            setIsEditing(false);
        }
    };

    // Comparison Logic
    let metaStatus = null;
    let isMetaPositive = false;

    if (goalValue !== undefined && value !== undefined) {
        // Parse current value (remove non-numeric chars)
        const currentNum = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : value;

        if (!isNaN(currentNum)) {
            if (isTime) {
                // For Time: Lower is Better
                // User said: "Acima da meta" = Green. So if Lower (Better), we say "Acima da Meta".
                isMetaPositive = currentNum <= goalValue;
                metaStatus = isMetaPositive ? "Acima da Meta" : "Abaixo da Meta";
            } else {
                // For %: Higher is Better
                isMetaPositive = currentNum >= goalValue;
                metaStatus = isMetaPositive ? "Acima da Meta" : "Abaixo da Meta";
            }
        }
    }

    return (
        <div className={cn("bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-start justify-between", className)}>
            <div>
                <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
                <div className="text-3xl font-bold text-slate-800 tracking-tight">{value}</div>

                {/* Goal Section */}
                {onGoalChange && (
                    <div className="mt-2">
                        {isEditing ? (
                            <div className="flex items-center space-x-2">
                                <input
                                    type="number"
                                    value={tempGoal}
                                    onChange={(e) => setTempGoal(e.target.value)}
                                    className="w-16 text-xs border rounded px-1 py-0.5"
                                    autoFocus
                                    onBlur={handleSave}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                />
                                <span className="text-xs text-slate-400">{suffix}</span>
                            </div>
                        ) : (
                            <div
                                className="group flex items-center space-x-1 cursor-pointer"
                                onClick={() => { setTempGoal(goalValue?.toString() || ""); setIsEditing(true); }}
                            >
                                <span className="text-xs text-slate-400">Meta: {goalValue}{suffix}</span>
                                <Edit2 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                            </div>
                        )}

                        {metaStatus && (
                            <div className={cn("text-xs font-bold mt-1", isMetaPositive ? "text-emerald-600" : "text-rose-600")}>
                                {metaStatus}
                            </div>
                        )}
                    </div>
                )}

                {description && <p className="text-slate-400 text-xs mt-1">{description}</p>}
                {trend && !onGoalChange && (
                    <div className={cn("text-xs font-medium mt-2 flex items-center", trendUp ? "text-emerald-600" : "text-rose-600")}>
                        {trend}
                    </div>
                )}
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg">
                <Icon className="w-6 h-6 text-indigo-600" />
            </div>
        </div>
    );
}
