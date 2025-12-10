"use client";

import { useState, useEffect } from "react";
import type { Agent } from "@/lib/types";

export function useAgents(specialization: string) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchAgents() {
      setLoading(true);
      try {
        const url = specialization
          ? `/api/agents?specialization=${encodeURIComponent(specialization)}`
          : "/api/agents";
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch agents");
        const data = await res.json();
        setAgents(data.agents);
      } catch {
        setAgents([]);
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, [specialization]);

  return { agents, loading };
}

