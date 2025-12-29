"use client";

import { useState, useEffect, startTransition } from "react";
import { cn } from "@/lib/utils";
import { Lock, Eye, EyeOff } from "lucide-react";

const AUTH_KEY = "hitech-auth";
const AUTH_EXPIRY_HOURS = 24;

interface PasswordGateProps {
  children: React.ReactNode;
}

function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;

  const authData = localStorage.getItem(AUTH_KEY);
  if (!authData) return false;

  try {
    const { expiry } = JSON.parse(authData);
    return Date.now() < expiry;
  } catch {
    return false;
  }
}

function setAuthenticated(): void {
  const expiry = Date.now() + AUTH_EXPIRY_HOURS * 60 * 60 * 1000;
  localStorage.setItem(AUTH_KEY, JSON.stringify({ expiry }));
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setIsAuthed(isAuthenticated());
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      setAuthenticated();
      setIsAuthed(true);
    } else {
      setError("סיסמה שגויה");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthed) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>

          <h1 className="mb-2 text-center text-2xl font-bold text-primary">
            הייטק סוכנות לביטוח
          </h1>
          <p className="mb-6 text-center text-gray-500">
            הזן סיסמה כדי להמשיך
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה"
                className={cn(
                  "w-full rounded-xl border-2 bg-gray-50 px-4 py-3 pl-12 transition-all",
                  "focus:border-accent focus:bg-white",
                  error ? "border-error" : "border-transparent"
                )}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {error && (
              <p className="text-center text-sm text-error">{error}</p>
            )}

            <button
              type="submit"
              className={cn(
                "w-full rounded-xl bg-primary py-3 font-semibold text-white transition-all",
                "hover:bg-primary/90 active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              disabled={!password}
            >
              כניסה
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

