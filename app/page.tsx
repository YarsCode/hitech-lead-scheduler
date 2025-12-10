"use client";

import { PasswordGate } from "@/components/PasswordGate";
import { LeadForm } from "@/components/LeadForm";

export default function Home() {
  return (
    <PasswordGate>
      <main className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 px-4 py-8 sm:py-12">
        <LeadForm />
      </main>
    </PasswordGate>
  );
}
