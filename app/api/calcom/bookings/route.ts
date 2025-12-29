import { NextRequest, NextResponse } from "next/server";
import type { BookingsResponse } from "@/lib/types";

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;

interface CalcomBookingHost {
  id: number;
  name: string;
  email: string;
  username: string;
  timeZone: string;
}

interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  hosts: CalcomBookingHost[];
  status: string;
  start: string;
  end: string;
}

interface CalcomBookingsApiResponse {
  status: string;
  data: CalcomBooking[];
  pagination: {
    returnedItems: number;
    totalItems: number;
    itemsPerPage: number;
    remainingItems: number;
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date"); // Expected format: YYYY-MM-DD

  if (!date) {
    return NextResponse.json(
      { error: "Missing date parameter" },
      { status: 400 }
    );
  }

  if (!CALCOM_API_KEY) {
    return NextResponse.json(
      { error: "Missing Cal.com API configuration" },
      { status: 500 }
    );
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  try {
    // Build date range for the entire day in UTC
    const afterStart = `${date}T00:00:00Z`;
    const beforeEnd = `${date}T23:59:59Z`;

    // Fetch all bookings for the specified date
    const allHostUserIds: number[] = [];
    let currentPage = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const url = new URL("https://api.cal.com/v2/bookings");
      url.searchParams.set("afterStart", afterStart);
      url.searchParams.set("beforeEnd", beforeEnd);
      url.searchParams.set("status", "upcoming,recurring");
      url.searchParams.set("take", "100");
      url.searchParams.set("page", currentPage.toString());

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${CALCOM_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Cal.com API error:", errorData);
        return NextResponse.json(
          { error: "Failed to fetch bookings from Cal.com" },
          { status: response.status }
        );
      }

      const data = await response.json();

      // Extract host user IDs from bookings that match the requested date
      // Cal.com API may not filter correctly, so we verify each booking's date
      const bookings = data.data?.bookings;
      if (Array.isArray(bookings)) {
        for (const booking of bookings) {
          if (!booking.user?.id) continue;
          
          const bookingStart = new Date(booking.startTime || booking.start);
          const bookingDateStr = bookingStart.toISOString().split("T")[0];
          
          if (bookingDateStr === date) {
            allHostUserIds.push(booking.user.id);
          }
        }
      }

      // Check if there are more pages using nextCursor
      hasNextPage = data.data?.nextCursor != null;
      currentPage++;
    }

    const result: BookingsResponse = { hostUserIds: allHostUserIds };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching Cal.com bookings:", error);
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}
