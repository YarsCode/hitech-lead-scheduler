"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

interface CalendarPopupProps {
  bookingLink: string;
  onBookingSuccess: () => void;
  onBookingError: () => void;
}

export function CalendarPopup({
  bookingLink,
  onBookingSuccess,
  onBookingError,
}: CalendarPopupProps) {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi();

      cal("on", {
        action: "bookingSuccessful",
        callback: () => {
          onBookingSuccess();
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

  return (
    <div className="h-[800px] md:h-[490px] w-full overflow-hidden rounded-xl border border-border">
      <Cal
        calLink={bookingLink}
        style={{ width: "100%", height: "100%", overflow: "auto" }}
        config={{
          layout: "month_view",
        }}
      />
    </div>
  );
}

