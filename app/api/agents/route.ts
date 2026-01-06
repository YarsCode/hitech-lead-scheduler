import { NextRequest, NextResponse } from "next/server";
import type { Agent, AgentsResponse } from "@/lib/types";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AGENTS_TABLE_ID = process.env.AIRTABLE_AGENTS_TABLE_ID;
const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;

const FORBIDDEN_TRAFFIC_LIGHT_STATUS = "🔴";
const EVEN_DISTRIBUTION_GAP_THRESHOLD = 3;
const MEMBERSHIPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let membershipsCache: { data: Map<string, number>; timestamp: number } | null = null;

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
    "רמזור"?: string;
    "מכסה יומית"?: number;
    "מכסה חודשית"?: number;
    "משקל"?: number;
    [key: string]: string | number | boolean | undefined;
  };
}

interface BookingCounts {
  currentMonth: Record<number, number>;
  nextMonth: Record<number, number>;
}

interface CalcomTeamMember {
  userId: number;
  accepted: boolean;
  user: { email: string };
}

type RecordWithUserId = { record: AirtableAgentRecord; userId: number };

async function getCalcomTeamMembers(): Promise<Map<string, number>> {
  if (membershipsCache && Date.now() - membershipsCache.timestamp < MEMBERSHIPS_CACHE_TTL_MS) {
    return membershipsCache.data;
  }

  const emailToUserId = new Map<string, number>();
  if (!CALCOM_API_KEY || !CALCOM_TEAM_ID) return emailToUserId;

  try {
    const response = await fetch(
      `https://api.cal.com/v2/teams/${CALCOM_TEAM_ID}/memberships`,
      { headers: { Authorization: `Bearer ${CALCOM_API_KEY}`, "Content-Type": "application/json" }, cache: "no-store" }
    );
    if (!response.ok) return membershipsCache?.data ?? emailToUserId;

    const { data } = await response.json() as { data: CalcomTeamMember[] };
    data
      .filter((m) => m.accepted && m.user?.email)
      .forEach((m) => emailToUserId.set(m.user.email.toLowerCase(), m.userId));
    
    membershipsCache = { data: emailToUserId, timestamp: Date.now() };
  } catch {
    console.error("Error fetching Cal.com team members");
    if (membershipsCache) return membershipsCache.data;
  }
  return emailToUserId;
}

async function getBookingCounts(): Promise<BookingCounts> {
  const empty: BookingCounts = { currentMonth: {}, nextMonth: {} };
  if (!CALCOM_API_KEY) return empty;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();

  const afterStart = new Date(Date.UTC(currentYear, currentMonth, 1)).toISOString().replace(".000Z", "Z");
  const beforeEnd = new Date(Date.UTC(nextYear, nextMonth + 1, 0, 23, 59, 59)).toISOString().replace(".000Z", "Z");

  const bookingCounts: BookingCounts = { currentMonth: {}, nextMonth: {} };
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
        headers: { Authorization: `Bearer ${CALCOM_API_KEY}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return empty;

      const data = await response.json();
      const bookings = data.data?.bookings;

      (bookings ?? [])
        .filter((b: { user?: { id?: number }; startTime?: string }) => b.user?.id && b.startTime)
        .forEach((b: { user: { id: number }; startTime: string }) => {
          const bookingDate = new Date(b.startTime);
          const bookingYear = bookingDate.getFullYear();
          const bookingMonth = bookingDate.getMonth();

          if (bookingYear === currentYear && bookingMonth === currentMonth) {
            bookingCounts.currentMonth[b.user.id] = (bookingCounts.currentMonth[b.user.id] || 0) + 1;
          } else if (bookingYear === nextYear && bookingMonth === nextMonth) {
            bookingCounts.nextMonth[b.user.id] = (bookingCounts.nextMonth[b.user.id] || 0) + 1;
          }
        });
      hasMore = data.data?.nextCursor != null;
      page++;
    }
  } catch {
    console.error("Error fetching bookings from Cal.com");
  }
  return bookingCounts;
}

function isAtMonthlyLimit(record: AirtableAgentRecord, userId: number, bookingCounts: BookingCounts): boolean {
  const limit = record.fields["מכסה חודשית"];
  if (limit == null) return false;
  return (bookingCounts.currentMonth[userId] || 0) >= limit && (bookingCounts.nextMonth[userId] || 0) >= limit;
}

function mapRecordToAgent(record: AirtableAgentRecord, userId: number): Agent {
  return {
    id: record.id,
    name: `${record.fields["שם פרטי"] || ""} ${record.fields["שם משפחה"] || ""}`.trim(),
    email: record.fields["מייל"],
    userId,
    dailyLimit: record.fields["מכסה יומית"],
    monthlyLimit: record.fields["מכסה חודשית"],
    weight: record.fields["משקל"],
    phone: record.fields["סלולרי"],
  };
}

function getEffectiveCount(agent: Agent, bookingCounts: BookingCounts): number {
  if (!agent.userId) return 0;
  const currCount = bookingCounts.currentMonth[agent.userId] || 0;
  const nextCount = bookingCounts.nextMonth[agent.userId] || 0;
  return currCount >= (agent.monthlyLimit ?? Infinity) ? nextCount : currCount;
}

function applyEvenDistribution(agents: Agent[], bookingCounts: BookingCounts): Agent[] {
  if (agents.length <= 1) return agents;
  const minCount = Math.min(...agents.map((a) => getEffectiveCount(a, bookingCounts)));
  return agents.filter((a) => getEffectiveCount(a, bookingCounts) <= minCount + EVEN_DISTRIBUTION_GAP_THRESHOLD);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const specialization = searchParams.get("specialization");
  const interest = searchParams.get("interest");
  const evenDistribution = searchParams.get("evenDistribution") === "true";
  const isManualMode = searchParams.get("manual") === "true";

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AGENTS_TABLE_ID) {
    return NextResponse.json({ error: "Missing Airtable configuration" }, { status: 500 });
  }

  try {
    const [airtableResponse, calcomEmailToUserId, bookingCounts] = await Promise.all([
      fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AGENTS_TABLE_ID}`, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_TOKEN}` },
        cache: "no-store",
      }),
      getCalcomTeamMembers(),
      isManualMode ? Promise.resolve({ currentMonth: {}, nextMonth: {} }) : getBookingCounts(),
    ]);

    if (!airtableResponse.ok) {
      throw new Error(`Airtable API error: ${airtableResponse.status}`);
    }

    const { records } = await airtableResponse.json() as { records: AirtableAgentRecord[] };

    const matchedRecords: RecordWithUserId[] = records
      .map((record) => ({ record, userId: calcomEmailToUserId.get(record.fields["מייל"]?.toLowerCase() ?? "") }))
      .filter((r): r is RecordWithUserId => {
        if (r.userId === undefined) return false;
        if (isManualMode) return !(specialization && r.record.fields[specialization] === true);
        return (
          r.record.fields["רמזור"] !== FORBIDDEN_TRAFFIC_LIGHT_STATUS &&
          !(specialization && r.record.fields[specialization] === true) &&
          !(interest && r.record.fields[interest] === true)
        );
      });

    let selectedRecords = matchedRecords;
    if (!isManualMode) {
      const primaryPool = matchedRecords.filter(({ record, userId }) => !isAtMonthlyLimit(record, userId, bookingCounts));
      const fallbackPool = matchedRecords.filter(({ record, userId }) => isAtMonthlyLimit(record, userId, bookingCounts));
      selectedRecords = primaryPool.length > 0 ? primaryPool : fallbackPool;
    }

    let agents = selectedRecords
      .map(({ record, userId }) => mapRecordToAgent(record, userId))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    if (!isManualMode && evenDistribution && agents.length > 1) {
      agents = applyEvenDistribution(agents, bookingCounts);
    }

    return NextResponse.json({ agents } as AgentsResponse);
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
