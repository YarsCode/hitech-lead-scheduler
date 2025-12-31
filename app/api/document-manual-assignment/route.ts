import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const MANUAL_ASSIGNMENT_TABLE_ID = process.env.AIRTABLE_MANUAL_ASSIGNMENT_DOCUMENTATION_TABLE_ID;

interface DocumentManualAssignmentRequest {
  username: string;
  agentName: string;
}

export async function POST(request: NextRequest) {
  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !MANUAL_ASSIGNMENT_TABLE_ID) {
    console.error("Missing Airtable configuration for manual assignment documentation");
    return NextResponse.json(
      { error: "Missing Airtable configuration" },
      { status: 500 }
    );
  }

  try {
    const body: DocumentManualAssignmentRequest = await request.json();
    const { username, agentName } = body;

    if (!username || !agentName) {
      return NextResponse.json(
        { error: "Missing required fields: username and agentName" },
        { status: 400 }
      );
    }

    // Create a new record in the manual assignment documentation table
    const airtableResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MANUAL_ASSIGNMENT_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                "שם משתמש המתאם": username,
                "הסוכן ששויך": agentName,
              },
            },
          ],
        }),
      }
    );

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.error("Airtable API error:", errorText);
      return NextResponse.json(
        { error: "Failed to document manual assignment" },
        { status: airtableResponse.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error documenting manual assignment:", error);
    return NextResponse.json(
      { error: "Failed to document manual assignment" },
      { status: 500 }
    );
  }
}

