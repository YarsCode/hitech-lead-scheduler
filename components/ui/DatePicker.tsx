"use client";

import * as React from "react";
import { he } from "date-fns/locale";
import { Calendar } from "./calendar";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

interface DatePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  error?: string;
  label?: string;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  // Friday (5) and Saturday (6) are weekends in Israel
  return day === 5 || day === 6;
}

function isDisabledDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Disable past dates
  if (date < today) return true;
  
  // Disable weekends (Friday, Saturday)
  if (isWeekend(date)) return true;
  
  return false;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  error,
  label,
}: DatePickerProps) {
  const handleSelect = (date: Date | undefined) => {
    if (date && !isDisabledDate(date)) {
      onChange(date);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="flex items-center gap-2 text-base font-medium text-gray-700">
          <CalendarDays className="h-5 w-5 text-primary" />
          {label}
        </label>
      )}
      <div
        className={cn(
          "rounded-xl border border-border bg-white shadow-sm transition-all overflow-hidden",
          disabled && "pointer-events-none opacity-50",
          error && "border-red-500"
        )}
      >
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          disabled={isDisabledDate}
          locale={he}
          weekStartsOn={0} // Sunday
          dir="rtl"
          showOutsideDays={false}
          className="w-full p-4 [&_.rdp-month]:w-full [&_.rdp-weekdays]:w-full [&_.rdp-weekday]:flex-1 [&_.rdp-week]:w-full [&_.rdp-day]:flex-1 [&_.rdp-button_previous]:order-2 [&_.rdp-button_next]:order-1 [&_.rdp-nav]:w-full [&_.rdp-month_caption]:w-full [&_.rdp-caption_label]:text-primary [&_.rdp-caption_label]:font-semibold [&_.rdp-caption_label]:text-lg"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-sm text-gray-500">
        * ימי עבודה בלבד (א׳-ה׳)
      </p>
    </div>
  );
}
