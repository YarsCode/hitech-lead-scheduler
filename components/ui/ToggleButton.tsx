import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface ToggleButtonProps {
  label: string;
  icon: LucideIcon;
  checked: boolean;
  onToggle: () => void;
}

export function ToggleButton({ label, icon: Icon, checked, onToggle }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 font-medium outline-none focus:border-accent",
        checked
          ? "border-accent bg-accent/10 text-primary"
          : "border-border bg-white text-gray-600 hover:border-accent/50 hover:bg-accent/5"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
      <div
        className={cn(
          "mr-auto h-5 w-9 rounded-full",
          checked ? "bg-accent" : "bg-gray-300"
        )}
        style={{ transition: "background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)" }}
      >
        <div
          className={cn(
            "toggle-switch h-5 w-5 rounded-full bg-white shadow-md",
            checked ? "-translate-x-4" : "translate-x-0"
          )}
        />
      </div>
    </button>
  );
}

