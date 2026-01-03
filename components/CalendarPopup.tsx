"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import type { BookingDetails } from "@/lib/types";

// Toggle to use fake emails (prevents Cal.com confirmation emails)
// When true, real emails are only passed via metadata to webhook for custom email handling
const USE_FAKE_EMAILS = false;
const FAKE_BOOKING_EMAIL = "noreply@booking.invalid";

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

  // Build guest list - use fake or real email based on toggle
  const guests = prefillData.additionalEmail 
    ? [USE_FAKE_EMAILS ? FAKE_BOOKING_EMAIL : prefillData.additionalEmail] 
    : [];

  // Determine email to use - fake or real based on toggle
  const bookingEmail = USE_FAKE_EMAILS ? FAKE_BOOKING_EMAIL : prefillData.email;

  return (
    <div className="h-[800px] md:h-[540px] w-full overflow-hidden rounded-xl border border-border">
      <Cal
        calLink={bookingLink}
        style={{ width: "100%", height: "100%", overflow: "auto" }}
        config={{
          layout: "month_view",
          language: "he",
          ...(prefillData.name && { name: prefillData.name }),
          ...(bookingEmail && { email: bookingEmail }),
          ...(guests.length > 0 && { guests }),
        }}
      />
    </div>
  );
}
