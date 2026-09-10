"use client";

import * as React from "react";
import { Clock, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* =============================================================================
   Design System Custom DateTime Input for Cashier Offline Recovery.
   Avoids browser OS native popup calendar; provides quick preset buttons
   and clean formatted inputs.
   ============================================================================= */

export function DateTimePicker({
  value,
  onChange,
  className,
}: {
  value: string; // ISO or YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  className?: string;
}) {
  const [datePart, setDatePart] = React.useState(() => {
    if (!value) return new Date().toISOString().slice(0, 10);
    return value.slice(0, 10);
  });

  const [timePart, setTimePart] = React.useState(() => {
    if (!value) return "09:00";
    if (value.includes("T")) return value.slice(11, 16);
    return "09:00";
  });

  React.useEffect(() => {
    if (datePart && timePart) {
      onChange(`${datePart}T${timePart}:00`);
    }
  }, [datePart, timePart, onChange]);

  const handleQuickPreset = (preset: "now" | "1hr_ago" | "morning" | "yesterday") => {
    const d = new Date();
    if (preset === "1hr_ago") {
      d.setHours(d.getHours() - 1);
    } else if (preset === "morning") {
      d.setHours(8, 30, 0, 0);
    } else if (preset === "yesterday") {
      d.setDate(d.getDate() - 1);
      d.setHours(14, 0, 0, 0);
    }
    const isoDate = d.toISOString().slice(0, 10);
    const isoTime = d.toTimeString().slice(0, 5);
    setDatePart(isoDate);
    setTimePart(isoTime);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-2 gap-2">
        {/* Date Selector */}
        <div className="relative">
          <CalendarIcon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="YYYY-MM-DD"
            value={datePart}
            onChange={(e) => setDatePart(e.target.value)}
            className="h-11 w-full pl-9 pr-3 rounded-xl border border-neutral-200 bg-white font-mono text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Time Selector */}
        <div className="relative">
          <Clock className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="HH:MM"
            value={timePart}
            onChange={(e) => setTimePart(e.target.value)}
            className="h-11 w-full pl-9 pr-3 rounded-xl border border-neutral-200 bg-white font-mono text-xs font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      {/* Cashier Quick Shortcuts */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <span className="text-[10px] text-neutral-400 font-bold uppercase self-center mr-1">Cepat:</span>
        <button
          type="button"
          onClick={() => handleQuickPreset("1hr_ago")}
          className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-700 hover:bg-neutral-100 transition-all"
        >
          1 Jam Lalu
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset("morning")}
          className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-700 hover:bg-neutral-100 transition-all"
        >
          Tadi Pagi (08:30)
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset("yesterday")}
          className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-700 hover:bg-neutral-100 transition-all"
        >
          Kemarin
        </button>
      </div>
    </div>
  );
}
