import { NextResponse } from "next/server";
import type { Specialization, SpecializationsResponse } from "@/lib/types";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SPECIALIZATIONS_TABLE_ID = process.env.AIRTABLE_SPECIALIZATIONS_TABLE_ID;

interface AirtableSpecializationRecord {
  id: string;
  createdTime: string;
  fields: {
    "סוגי הלידים": string;
  };
}

interface AirtableSpecializationsResponse {
  records: AirtableSpecializationRecord[];
}

export async function GET() {
  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !SPECIALIZATIONS_TABLE_ID) {
    return NextResponse.json(
      { error: "Missing Airtable configuration" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SPECIALIZATIONS_TABLE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        },
        // Cache for 5 minutes since specializations don't change often
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    const data: AirtableSpecializationsResponse = await response.json();

    const specializations: Specialization[] = data.records
      .map((record) => ({
        id: record.id,
        name: record.fields["סוגי הלידים"],
      }))
      // Sort alphabetically by Hebrew name (א-ת)
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    const result: SpecializationsResponse = { specializations };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching specializations:", error);
    return NextResponse.json(
      { error: "Failed to fetch specializations" },
      { status: 500 }
    );
  }
}

