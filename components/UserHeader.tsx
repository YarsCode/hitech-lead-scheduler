"use client";

import { LogOut } from "lucide-react";
import { getCurrentUser, logout } from "@/components/LoginGate";

export function UserHeader() {
  const user = getCurrentUser();

  if (!user) return null;

  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
      <span className="text-sm text-gray-600">
        שלום, <span className="font-medium text-primary">{user.name}</span>
      </span>
      <button
        onClick={logout}
        className="flex cursor-pointer items-center justify-center rounded-lg bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-primary"
        title="להתנתק"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}
