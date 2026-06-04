import { NextRequest, NextResponse } from "next/server";
import type { Agent, AgentsResponse } from "@/lib/types";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AGENTS_TABLE_ID = process.env.AIRTABLE_AGENTS_TABLE_ID;
const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;

const FORBIDDEN_TRAFFIC_LIGHT_STATUS = "🔴";
const EVEN_DISTRIBUTION_GAP_THRESHOLD = Number(process.env.EVEN_DISTRIBUTION_GAP_THRESHOLD) || 6;
const MIN_AVAILABLE_HOSTS = 10;
const MEMBERSHIPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PACE_RATIO_EPSILON = 0.01; // guards divide-by-zero on day 1 with low monthly limits
const PACING_VERBOSE = process.env.PACING_VERBOSE === "true";

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
    "היה שינוי במשקל הסוכן"?: boolean;
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

function getJerusalemDayInfo(): { daysElapsed: number; daysInMonth: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return {
    daysElapsed: d,
    // Date(y, m, 0) returns the last day of month m (1-based), i.e. days-in-month
    daysInMonth: new Date(y, m, 0).getDate(),
  };
}

function computeExpectedMonthlyCount(
  monthlyLimit: number | undefined,
  weight: number | undefined,
  daysElapsed: number,
  daysInMonth: number
): number | undefined {
  if (monthlyLimit == null) return undefined;
  const weightMult = (weight ?? 100) / 100;
  return monthlyLimit * (daysElapsed / daysInMonth) * weightMult;
}

function mapRecordToAgent(
  record: AirtableAgentRecord,
  userId: number,
  daysElapsed: number,
  daysInMonth: number
): Agent {
  const weight = record.fields["משקל"];
  const monthlyLimit = record.fields["מכסה חודשית"];
  return {
    id: record.id,
    name: `${record.fields["שם פרטי"] || ""} ${record.fields["שם משפחה"] || ""}`.trim(),
    email: record.fields["מייל"],
    userId,
    dailyLimit: record.fields["מכסה יומית"],
    monthlyLimit,
    weight,
    phone: record.fields["סלולרי"],
    monthlyBookingCount: getMonthlyBookingCount(record),
    expectedMonthlyCount: computeExpectedMonthlyCount(monthlyLimit, weight, daysElapsed, daysInMonth),
  };
}

// Kept intentionally for easy re-enable if pacing underperforms. See call site replacement below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function applyEvenDistribution(agents: Agent[], recordsByUserId: Map<number, AirtableAgentRecord>): Agent[] {
  if (agents.length <= 1) return agents;
  const getCount = (a: Agent) => a.userId ? getMonthlyBookingCount(recordsByUserId.get(a.userId)!) : 0;
  const minCount = Math.min(...agents.map(getCount));

  const kept: Agent[] = [];
  const excluded: Agent[] = [];
  for (const a of agents) {
    if (getCount(a) <= minCount + EVEN_DISTRIBUTION_GAP_THRESHOLD) kept.push(a);
    else excluded.push(a);
  }

  if (kept.length >= MIN_AVAILABLE_HOSTS || excluded.length === 0) return kept;

  const sortedExcluded = [...excluded].sort((a, b) => {
    const diff = getCount(a) - getCount(b);
    return diff !== 0 ? diff : Math.random() - 0.5;
  });
  const needed = MIN_AVAILABLE_HOSTS - kept.length;
  return [...kept, ...sortedExcluded.slice(0, needed)];
}

/**
 * Per-agent monthly pacing filter. Replaces the cross-agent `applyEvenDistribution`.
 *
 * For each agent, computes an expected booking count by today based on his own
 * monthly limit, current weight, and the fraction of the month elapsed (Asia/Jerusalem).
 * Excludes the agent if his actual count meets or exceeds that expected ceiling.
 *
 * Two exemptions never exclude an agent:
 *   - `monthlyLimit` undefined (treat as unlimited)
 *   - "היה שינוי במשקל הסוכן" checkbox is true (manager lowered his weight this month)
 *
 * If pacing leaves the pool below MIN_AVAILABLE_HOSTS, the excluded agents are
 * re-added in pace-ratio ascending order (closest to their target first) up to the floor.
 */
function applyMonthlyPacing(
  agents: Agent[],
  recordsByUserId: Map<number, AirtableAgentRecord>,
  daysElapsed: number,
  daysInMonth: number
): Agent[] {
  if (agents.length === 0) return agents;

  let excludedByPacing = 0;
  let keptByFlag = 0;
  let unlimited = 0;

  const kept: Agent[] = [];
  const excluded: Agent[] = [];

  for (const agent of agents) {
    const record = agent.userId != null ? recordsByUserId.get(agent.userId) : undefined;
    const flagSet = record?.fields["היה שינוי במשקל הסוכן"] === true;
    const actual = agent.monthlyBookingCount ?? 0;
    const expected = agent.expectedMonthlyCount;

    let decision: "keep" | "exclude";
    if (expected == null) {
      // Unlimited agent (no monthly limit) — pacing doesn't apply
      decision = "keep";
      unlimited++;
    } else if (flagSet) {
      // Weight was decreased this month — exempt until monthly reset
      decision = "keep";
      keptByFlag++;
    } else if (actual >= expected) {
      decision = "exclude";
      excludedByPacing++;
    } else {
      decision = "keep";
    }

    if (PACING_VERBOSE) {
      const ratio = expected ? (actual / Math.max(expected, PACE_RATIO_EPSILON)).toFixed(2) : "n/a";
      console.log(
        `[pacing] userId=${agent.userId} limit=${agent.monthlyLimit ?? "none"} weight=${agent.weight ?? 100} actual=${actual} expected=${expected?.toFixed(2) ?? "n/a"} ratio=${ratio} flag=${flagSet} decision=${decision}`
      );
    }

    if (decision === "keep") kept.push(agent);
    else excluded.push(agent);
  }

  // Safety net: top up to MIN_AVAILABLE_HOSTS using excluded agents closest to their own pace
  let topUpFromFloor = 0;
  let final = kept;
  if (final.length < MIN_AVAILABLE_HOSTS && excluded.length > 0) {
    const paceRatio = (a: Agent) =>
      (a.monthlyBookingCount ?? 0) / Math.max(a.expectedMonthlyCount ?? PACE_RATIO_EPSILON, PACE_RATIO_EPSILON);
    const sortedExcluded = [...excluded].sort((a, b) => {
      const diff = paceRatio(a) - paceRatio(b);
      return diff !== 0 ? diff : Math.random() - 0.5;
    });
    const needed = MIN_AVAILABLE_HOSTS - final.length;
    const topUp = sortedExcluded.slice(0, needed);
    topUpFromFloor = topUp.length;
    final = [...final, ...topUp];
  }

  console.log(
    `[pacing] day=${daysElapsed}/${daysInMonth} in=${agents.length} excludedByPacing=${excludedByPacing} keptByFlag=${keptByFlag} unlimited=${unlimited} topUpFromFloor=${topUpFromFloor} final=${final.length}`
  );

  return final;
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

    const { daysElapsed, daysInMonth } = getJerusalemDayInfo();

    let agents = selectedRecords
      .map(({ record, userId }) => mapRecordToAgent(record, userId, daysElapsed, daysInMonth))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    if (!isManualMode && evenDistribution && agents.length > 1) {
      const recordsByUserId = new Map(matchedRecords.map(({ record, userId }) => [userId, record]));
      // Was: applyEvenDistribution — disabled in favor of monthly pacing (per-agent) + pace-ratio sort + demotion-flag immunity. Function definition kept above for easy re-enable.
      agents = applyMonthlyPacing(agents, recordsByUserId, daysElapsed, daysInMonth);
    }

    return NextResponse.json({ agents } as AgentsResponse);
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
