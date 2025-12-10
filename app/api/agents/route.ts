import { NextRequest, NextResponse } from "next/server";
import type { Agent, AgentsResponse } from "@/lib/types";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AGENTS_TABLE_ID = process.env.AIRTABLE_AGENTS_TABLE_ID;

const FORBIDDEN_TRAFFIC_LIGHT_STATUS = "🔴";

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
    [key: string]: string | number | boolean | undefined;
  };
}

interface AirtableAgentsResponse {
  records: AirtableAgentRecord[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const specialization = searchParams.get("specialization");

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AGENTS_TABLE_ID) {
    return NextResponse.json(
      { error: "Missing Airtable configuration" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AGENTS_TABLE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    const data: AirtableAgentsResponse = await response.json();

    const agents: Agent[] = data.records
      .filter((record) => {
        if (record.fields["רמזור"] === FORBIDDEN_TRAFFIC_LIGHT_STATUS) return false;
        if (!specialization) return true;

        return record.fields[specialization] !== true;
      })
      .map((record) => ({
        id: record.id,
        name: `${record.fields["שם פרטי"] || ""} ${record.fields["שם משפחה"] || ""}`.trim(),
        userId: record.fields["userId"],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

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
