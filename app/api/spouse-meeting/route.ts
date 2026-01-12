import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const N8N_WEBHOOK_URL = process.env.N8N_SPOUSE_MEETING_WEBHOOK_URL;

const requestSchema = z.object({
  leadId: z.string().min(1),
});

// Shape of the Surense meeting object from n8n
const surenseMeetingSchema = z.object({
  email: z.string().email(),
  startDate: z.string(),
  endDate: z.string(),
});

export async function POST(request: NextRequest) {
  if (!N8N_WEBHOOK_URL) {
    return NextResponse.json(
      { success: false, error: "Spouse meeting webhook not configured" },
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
      console.error("n8n webhook error:", response.status);
      return NextResponse.json({ success: true, meeting: null });
    }

    const data = await response.json();

    const meeting = Array.isArray(data) ? data[0] : data;
    if (!meeting) {
      return NextResponse.json({ success: true, meeting: null });
    }

    const meetingData = surenseMeetingSchema.safeParse(meeting);
    if (!meetingData.success) {
      return NextResponse.json({ success: true, meeting: null });
    }

    return NextResponse.json({
      success: true,
      meeting: {
        agentEmail: meetingData.data.email,
        startDate: meetingData.data.startDate,
        endDate: meetingData.data.endDate,
      },
    });
  } catch (error) {
    console.error("Error fetching spouse meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch meeting data" },
      { status: 500 }
    );
  }
}
