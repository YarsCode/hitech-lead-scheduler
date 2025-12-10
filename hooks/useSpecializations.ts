"use client";

import { useState, useEffect } from "react";
import type { Specialization } from "@/lib/types";

export function useSpecializations() {
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSpecializations() {
      try {
        const res = await fetch("/api/specializations");
        if (!res.ok) throw new Error("Failed to fetch specializations");
        const data = await res.json();
        setSpecializations(data.specializations);
      } catch (error) {
        console.error("Error fetching specializations:", error);
        setSpecializations([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSpecializations();
  }, []);

  return { specializations, loading };
}

