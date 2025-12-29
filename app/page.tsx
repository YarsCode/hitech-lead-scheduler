"use client";

import Image from "next/image";
import { PasswordGate } from "@/components/PasswordGate";
import { LeadForm } from "@/components/LeadForm";

export default function Home() {
  return (
    <>
      {/* Company Logo - Positioned at top left */}
      <div className="absolute top-4 left-4 z-50">
        <Image
          src="https://ht-ins.co.il/wp-content/themes/htins/sitefiles/htins-logo.png"
          alt="Hitech Insurance Logo"
          width={180}
          height={60}
          className="h-14 w-auto sm:h-16 rounded-[6px]"
          priority
        />
      </div>
      <PasswordGate>
        <main className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 px-4 py-8 sm:py-12">
          <LeadForm />
        </main>
      </PasswordGate>
    </>
  );
}
