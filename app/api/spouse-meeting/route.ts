import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const N8N_WEBHOOK_URL = process.env.N8N_SPOUSE_MEETING_WEBHOOK_URL;

const requestSchema = z.object({
  leadId: z.string().min(1),
});

const n8nResponseSchema = z.object({
  email: z.string().email(),
  eventTypeId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!N8N_WEBHOOK_URL) {
    return NextResponse.json(
      { success: false, error: "Webhook not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: parsed.data.leadId }),
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: "Failed to fetch agent" });
    }

    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : data;

    const result = n8nResponseSchema.safeParse(item);
    if (!result.success) {
      return NextResponse.json({ success: false, error: "No agent found for this lead" });
    }

    return NextResponse.json({
      success: true,
      agentEmail: result.data.email,
      eventTypeId: result.data.eventTypeId,
    });
  } catch (error) {
    console.error("Error fetching spouse agent:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch agent data" },
      { status: 500 }
    );
  }
}
