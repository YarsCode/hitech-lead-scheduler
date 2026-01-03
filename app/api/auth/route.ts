import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const USERS_TABLE_ID = process.env.AIRTABLE_USERS_TABLE_ID;

const authSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100),
});

interface AirtableUserRecord {
  id: string;
  fields: {
    "שם משתמש"?: string;
    "סיסמא"?: string;
    "שם הנציג/ה"?: string;
  };
}

interface AirtableUsersResponse {
  records: AirtableUserRecord[];
}

function sanitizeForAirtableFormula(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(request: NextRequest) {
  const parsed = authSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !USERS_TABLE_ID) {
    console.error("Missing Airtable configuration for auth");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const safeUsername = sanitizeForAirtableFormula(username);
    const safePassword = sanitizeForAirtableFormula(password);
    const filterFormula = `AND({שם משתמש}="${safeUsername}",{סיסמא}="${safePassword}")`;
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${USERS_TABLE_ID}`
    );
    url.searchParams.set("filterByFormula", filterFormula);
    url.searchParams.set("maxRecords", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.error("Airtable API error:", response.status);
      return NextResponse.json(
        { error: "Authentication service error" },
        { status: 500 }
      );
    }

    const data: AirtableUsersResponse = await response.json();

    if (data.records.length === 0) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const user = data.records[0];
    const name = user.fields["שם הנציג/ה"] || username;

    return NextResponse.json({
      success: true,
      username,
      name,
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
