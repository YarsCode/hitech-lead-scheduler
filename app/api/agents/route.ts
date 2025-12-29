import { NextRequest, NextResponse } from "next/server";
import type { Agent, AgentsResponse } from "@/lib/types";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AGENTS_TABLE_ID = process.env.AIRTABLE_AGENTS_TABLE_ID;
const CALCOM_API_KEY = process.env.CALCOM_API_KEY;

const FORBIDDEN_TRAFFIC_LIGHT_STATUS = "🔴";
const EVEN_DISTRIBUTION_GAP_THRESHOLD = 3;

interface AirtableAgentRecord {
  id: string;
  createdTime: string;
  fields: {
    "שם פרטי"?: string;
    "שם משפחה"?: string;
    "מייל"?: string;
    "סלולרי"?: string;
    "מספר ת.ז."?: number;
    "תפקיד"?: string;
    "userId"?: number;
    "רמזור"?: string;
    "מכסה יומית"?: number;
    "מכסה חודשית"?: number;
    "משקל"?: number;
    [key: string]: string | number | boolean | undefined;
  };
}

interface AirtableAgentsResponse {
  records: AirtableAgentRecord[];
}

interface BookingCounts {
  currentMonth: Record<number, number>;
  nextMonth: Record<number, number>;
}

/**
 * Fetches bookings for current and next month from Cal.com.
 * Categorizes each booking by the month it occurs in.
 */
async function getBookingCounts(): Promise<BookingCounts> {
  const empty: BookingCounts = { currentMonth: {}, nextMonth: {} };
  
  if (!CALCOM_API_KEY) {
    console.warn("Missing CALCOM_API_KEY, skipping monthly limit check");
    return empty;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Next month (handles year rollover)
  const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();

  // Date range: start of current month to end of next month
  const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
  const endOfNextMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0, 23, 59, 59));

  const afterStart = startOfCurrentMonth.toISOString().replace(".000Z", "Z");
  const beforeEnd = endOfNextMonth.toISOString().replace(".000Z", "Z");

  const counts: BookingCounts = { currentMonth: {}, nextMonth: {} };
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const url = new URL("https://api.cal.com/v2/bookings");
      url.searchParams.set("afterStart", afterStart);
      url.searchParams.set("beforeEnd", beforeEnd);
      url.searchParams.set("status", "upcoming,recurring,past");
      url.searchParams.set("take", "100");
      url.searchParams.set("page", page.toString());

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${CALCOM_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Cal.com API error:", response.status);
        return empty;
      }

      const data = await response.json();
      const bookings = data.data?.bookings;

      if (Array.isArray(bookings)) {
        for (const booking of bookings) {
          const userId = booking.user?.id;
          const startTime = booking.startTime;
          if (!userId || !startTime) continue;

          const bookingDate = new Date(startTime);
          const bookingYear = bookingDate.getFullYear();
          const bookingMonth = bookingDate.getMonth();

          if (bookingYear === currentYear && bookingMonth === currentMonth) {
            counts.currentMonth[userId] = (counts.currentMonth[userId] || 0) + 1;
          } else if (bookingYear === nextYear && bookingMonth === nextMonth) {
            counts.nextMonth[userId] = (counts.nextMonth[userId] || 0) + 1;
          }
        }
      }

      hasMore = data.data?.nextCursor != null;
      page++;
    }
  } catch (error) {
    console.error("Error fetching bookings from Cal.com:", error);
    return empty;
  }

  return counts;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const specialization = searchParams.get("specialization");
  const evenDistribution = searchParams.get("evenDistribution") === "true";

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AGENTS_TABLE_ID) {
    return NextResponse.json(
      { error: "Missing Airtable configuration" },
      { status: 500 }
    );
  }

  try {
    const [airtableResponse, bookingCounts] = await Promise.all([
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AGENTS_TABLE_ID}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_API_TOKEN}` } }
      ),
      getBookingCounts(),
    ]);

    if (!airtableResponse.ok) {
      throw new Error(`Airtable API error: ${airtableResponse.status}`);
    }

    const data: AirtableAgentsResponse = await airtableResponse.json();

    let agents: Agent[] = data.records
      .filter((record) => {
        if (record.fields["רמזור"] === FORBIDDEN_TRAFFIC_LIGHT_STATUS) return false;
        if (specialization && record.fields[specialization] === true) return false;

        // Only exclude if at limit in BOTH months
        const limit = record.fields["מכסה חודשית"];
        const userId = record.fields["userId"];
        if (limit && userId) {
          const currCount = bookingCounts.currentMonth[userId] || 0;
          const nextCount = bookingCounts.nextMonth[userId] || 0;
          if (currCount >= limit && nextCount >= limit) return false;
        }

        return true;
      })
      .map((record) => ({
        id: record.id,
        name: `${record.fields["שם פרטי"] || ""} ${record.fields["שם משפחה"] || ""}`.trim(),
        email: record.fields["מייל"],
        userId: record.fields["userId"],
        dailyLimit: record.fields["מכסה יומית"],
        monthlyLimit: record.fields["מכסה חודשית"],
        weight: record.fields["משקל"],
        phone: record.fields["סלולרי"],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    console.log(
      `[Agents] After initial filter: ${agents.length} agents`,
      agents.map((a) => `${a.name}(curr:${a.userId ? bookingCounts.currentMonth[a.userId] || 0 : 0}, next:${a.userId ? bookingCounts.nextMonth[a.userId] || 0 : 0})`)
    );

    // Even distribution: compare agents by their effective booking count
    if (evenDistribution && agents.length > 1) {
      const getEffectiveCount = (agent: Agent): number => {
        if (!agent.userId) return 0;
        const currCount = bookingCounts.currentMonth[agent.userId] || 0;
        const nextCount = bookingCounts.nextMonth[agent.userId] || 0;
        const limit = agent.monthlyLimit ?? Infinity;
        // If at current month limit, use next month count (only month they can accept)
        return currCount >= limit ? nextCount : currCount;
      };

      const minCount = Math.min(...agents.map(getEffectiveCount));
      agents = agents.filter(
        (agent) => getEffectiveCount(agent) <= minCount + EVEN_DISTRIBUTION_GAP_THRESHOLD
      );

      console.log(
        `[Agents] After even distribution: ${agents.length} agents`,
        agents.map((a) => `${a.name}(eff:${getEffectiveCount(a)})`)
      );
    }

    const result: AgentsResponse = { agents };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
