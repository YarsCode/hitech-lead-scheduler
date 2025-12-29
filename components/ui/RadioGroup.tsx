"use client";

import { cn } from "@/lib/utils";
import { KeyboardEvent } from "react";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function RadioGroup({ options, value, onChange, className }: RadioGroupProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, optionValue: string) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(optionValue);
    }
  };

  return (
    <div className={cn("space-y-3", className)} role="radiogroup">
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <div
            key={option.value}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, option.value)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all duration-150",
              "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              isSelected
                ? "border-accent bg-accent/10"
                : "border-border bg-white hover:border-accent/50 hover:bg-accent/5"
            )}
          >
            {/* Custom radio circle */}
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                isSelected
                  ? "border-accent bg-accent"
                  : "border-gray-300 bg-white"
              )}
            >
              {isSelected && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <div className="flex-1">
              <span className={cn(
                "font-medium transition-colors duration-150",
                isSelected ? "text-primary" : "text-gray-600"
              )}>
                {option.label}
              </span>
              {option.description && (
                <p className="mt-0.5 text-sm text-gray-500">{option.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
