"use client";

import { useState, useEffect } from "react";
import type { Agent } from "@/lib/types";

export function useAgents(specialization: string, evenDistribution = false) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchAgents() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (specialization) params.set("specialization", specialization);
        if (evenDistribution) params.set("evenDistribution", "true");
        
        const url = `/api/agents${params.toString() ? `?${params}` : ""}`;
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
  }, [specialization, evenDistribution]);

  return { agents, loading };
}

