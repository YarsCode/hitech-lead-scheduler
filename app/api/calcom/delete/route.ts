import { NextRequest, NextResponse } from "next/server";

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;

async function deleteEventType(eventTypeId: string) {
  if (!CALCOM_API_KEY || !CALCOM_TEAM_ID) {
    return NextResponse.json(
      { error: "Missing Cal.com API configuration" },
      { status: 500 }
    );
  }

  try {
    // Delete team event type via Cal.com API v2
    const calcomResponse = await fetch(
      `https://api.cal.com/v2/teams/${CALCOM_TEAM_ID}/event-types/${eventTypeId}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${CALCOM_API_KEY}`,
        },
      }
    );

    if (!calcomResponse.ok) {
      const errorData = await calcomResponse.text();
      console.error("Cal.com API error deleting event type:", errorData);
      // Return success anyway if it's a 404 (already deleted)
      if (calcomResponse.status === 404) {
        return NextResponse.json({ success: true, alreadyDeleted: true });
      }
      return NextResponse.json(
        { error: "Failed to delete event type in Cal.com", details: errorData },
        { status: calcomResponse.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Cal.com event type:", error);
    return NextResponse.json(
      { error: "Failed to delete event type" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventTypeId = searchParams.get("eventTypeId");

  if (!eventTypeId) {
    return NextResponse.json(
      { error: "Event type ID is required" },
      { status: 400 }
    );
  }

  return deleteEventType(eventTypeId);
}

