"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import type { BookingDetails } from "@/lib/types";

interface PrefillData {
  name?: string;
  email?: string;
  additionalEmail?: string;
}

interface CalendarPopupProps {
  bookingLink: string;
  prefillData: PrefillData;
  onBookingSuccess: (details: BookingDetails) => void;
  onBookingError: () => void;
}

export function CalendarPopup({
  bookingLink,
  prefillData,
  onBookingSuccess,
  onBookingError,
}: CalendarPopupProps) {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi();

      cal("on", {
        action: "bookingSuccessful",
        callback: (e: unknown) => {
          const event = e as CustomEvent<{
            data?: {
              booking?: {
                startTime?: string;
                endTime?: string;
                user?: { name?: string };
              };
            };
          }>;
          
          const booking = event.detail?.data?.booking;
          const details: BookingDetails = {
            agentName: booking?.user?.name || "",
            startTime: booking?.startTime || "",
            endTime: booking?.endTime || "",
          };
          onBookingSuccess(details);
        },
      });

      cal("on", {
        action: "linkFailed",
        callback: () => {
          onBookingError();
        },
      });
    })();
  }, [onBookingSuccess, onBookingError]);

  // Add guest email if there's an additional lead with email
  const guests = prefillData.additionalEmail ? [prefillData.additionalEmail] : [];

  return (
    <div className="h-[800px] md:h-[540px] w-full overflow-hidden rounded-xl border border-border">
      <Cal
        calLink={bookingLink}
        style={{ width: "100%", height: "100%", overflow: "auto" }}
        config={{
          layout: "month_view",
          language: "he",
          ...(prefillData.name && { name: prefillData.name }),
          ...(prefillData.email && { email: prefillData.email }),
          ...(guests.length > 0 && { guests }),
        }}
      />
    </div>
  );
}
