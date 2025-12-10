"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, className, disabled, ...props }, ref) => {
    return (
      <div className={cn("space-y-1.5", className)}>
        {label && (
          <label className="block text-base font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className={cn("relative", disabled && "opacity-60")}>
          <input
            ref={ref}
            disabled={disabled}
            className={cn(
              "w-full rounded-xl border-2 border-border bg-white px-4 py-3",
              "focus:border-accent focus:ring-0 focus:outline-none",
              "placeholder:text-gray-400",
              "disabled:cursor-not-allowed disabled:bg-gray-50",
              error && "border-error"
            )}
            {...props}
          />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    );
  }
);

TextInput.displayName = "TextInput";

