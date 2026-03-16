import { NextRequest, NextResponse } from "next/server";
import type { Agent, AgentsResponse } from "@/lib/types";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AGENTS_TABLE_ID = process.env.AIRTABLE_AGENTS_TABLE_ID;
const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;

const FORBIDDEN_TRAFFIC_LIGHT_STATUS = "🔴";
const EVEN_DISTRIBUTION_GAP_THRESHOLD = 5;
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
      { headers: { Authorization: `Bearer ${CALCOM_API_KEY}`, "Content-Type": "application/json", "cal-api-version": "2024-06-14" }, cache: "no-store" }
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

function getMonthlyBookingCount(record: AirtableAgentRecord): number {
  return (record.fields["כמות פגישות שנקבעו החודש"] as number) ?? 0;
}

function isAtMonthlyLimit(record: AirtableAgentRecord): boolean {
  const limit = record.fields["מכסה חודשית"];
  if (limit == null) return false;
  return getMonthlyBookingCount(record) >= limit;
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
    monthlyBookingCount: getMonthlyBookingCount(record),
  };
}

function applyEvenDistribution(agents: Agent[], recordsByUserId: Map<number, AirtableAgentRecord>): Agent[] {
  if (agents.length <= 1) return agents;
  const getCount = (a: Agent) => a.userId ? getMonthlyBookingCount(recordsByUserId.get(a.userId)!) : 0;
  const minCount = Math.min(...agents.map(getCount));
  return agents.filter((a) => getCount(a) <= minCount + EVEN_DISTRIBUTION_GAP_THRESHOLD);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const specialization = searchParams.get("specialization");
  const interest = searchParams.get("interest");
  const evenDistribution = searchParams.get("evenDistribution") === "true";
  const isManualMode = searchParams.get("manual") === "true";
  const bypassFilters = searchParams.get("bypassFilters") === "true"; // For spouse booking - ignores traffic light & limits

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AGENTS_TABLE_ID) {
    return NextResponse.json({ error: "Missing Airtable configuration" }, { status: 500 });
  }

  try {
    const [airtableResponse, calcomEmailToUserId] = await Promise.all([
      fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AGENTS_TABLE_ID}`, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_TOKEN}` },
        cache: "no-store",
      }),
      getCalcomTeamMembers(),
    ]);
    if (!airtableResponse.ok) {
      throw new Error(`Airtable API error: ${airtableResponse.status}`);
    }

    const { records } = await airtableResponse.json() as { records: AirtableAgentRecord[] };

    const matchedRecords: RecordWithUserId[] = records
      .map((record) => ({ record, userId: calcomEmailToUserId.get(record.fields["מייל"]?.toLowerCase() ?? "") }))
      .filter((r): r is RecordWithUserId => {
        if (r.userId === undefined) return false;
        if (bypassFilters) return true; // Spouse mode - return all agents with userId
        if (isManualMode) return !(specialization && r.record.fields[specialization] === true);
        return (
          r.record.fields["רמזור"] !== FORBIDDEN_TRAFFIC_LIGHT_STATUS &&
          !(specialization && r.record.fields[specialization] === true) &&
          !(interest && r.record.fields[interest] === true)
        );
      });

    let selectedRecords = matchedRecords;
    if (!isManualMode && !bypassFilters) {
      const primaryPool = matchedRecords.filter(({ record }) => !isAtMonthlyLimit(record));
      const fallbackPool = matchedRecords.filter(({ record }) => isAtMonthlyLimit(record));
      selectedRecords = primaryPool.length > 0 ? primaryPool : fallbackPool;
    }

    let agents = selectedRecords
      .map(({ record, userId }) => mapRecordToAgent(record, userId))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    if (!isManualMode && evenDistribution && agents.length > 1) {
      const recordsByUserId = new Map(matchedRecords.map(({ record, userId }) => [userId, record]));
      agents = applyEvenDistribution(agents, recordsByUserId);
    }

    return NextResponse.json({ agents } as AgentsResponse);
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
