"use client";

import { useState, useEffect, startTransition } from "react";
import { cn } from "@/lib/utils";
import { Lock, Eye, EyeOff, User as UserIcon } from "lucide-react";
import type { User } from "@/lib/types";

const AUTH_KEY = "hitech-auth";

interface LoginGateProps {
  children: React.ReactNode;
}

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;

  const authData = localStorage.getItem(AUTH_KEY);
  if (!authData) return null;

  try {
    const user = JSON.parse(authData) as User;
    // Validate that required fields exist
    if (user.username && user.name) {
      return user;
    }
    return null;
  } catch {
    return null;
  }
}

function setStoredUser(user: User): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

// Export for use in other components
export function getCurrentUser(): User | null {
  return getStoredUser();
}

export function LoginGate({ children }: LoginGateProps) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // TODO: I WILL REMOVE THIS MANUALLY - Testing only: force login on every refresh
    // localStorage.removeItem(AUTH_KEY);
    // END TODO

    startTransition(() => {
      setIsAuthed(getStoredUser() !== null);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStoredUser({
          username: data.username,
          name: data.name,
        });
        setIsAuthed(true);
      } else {
        setError("שם משתמש או סיסמה שגויים");
      }
    } catch {
      setError("שגיאה בהתחברות, נסה שוב");
    } finally {
      setSubmitting(false);
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
            הזן פרטי התחברות כדי להמשיך
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="שם משתמש"
                className={cn(
                  "w-full rounded-xl border-2 bg-gray-50 px-4 py-3 pl-12 transition-all",
                  "focus:border-accent focus:bg-white focus:outline-none",
                  error ? "border-error" : "border-transparent"
                )}
                autoFocus
                disabled={submitting}
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <UserIcon size={20} />
              </div>
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה"
                className={cn(
                  "w-full rounded-xl border-2 bg-gray-50 px-4 py-3 pl-12 transition-all",
                  "focus:border-accent focus:bg-white focus:outline-none",
                  error ? "border-error" : "border-transparent"
                )}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={submitting}
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
              disabled={!username || !password || submitting}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  מתחבר...
                </span>
              ) : (
                "כניסה"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

