import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const USERS_TABLE_ID = process.env.AIRTABLE_USERS_TABLE_ID;

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

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Missing username or password" },
      { status: 400 }
    );
  }

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !USERS_TABLE_ID) {
    console.error("Missing Airtable configuration for auth");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    // Query Airtable for matching username and password
    const filterFormula = `AND({שם משתמש}="${username}",{סיסמא}="${password}")`;
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
