import { NextRequest, NextResponse } from "next/server";

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;
const CALCOM_TEAM_SLUG = process.env.CALCOM_TEAM_SLUG

interface Host {
  userId: number;
  weight: number;
}

interface CreateEventTypeRequest {
  primaryLeadId: string;
  additionalLeadId?: string;
  agentName?: string;
  hosts: Host[];
  isInPersonMeeting?: boolean;
  address?: string;
  specialization?: string;
}

interface CalcomEventTypeResponse {
  status: string;
  data: {
    id: number;
    slug: string;
    title: string;
    lengthInMinutes: number;
  };
}

export async function POST(request: NextRequest) {
  if (!CALCOM_API_KEY) {
    return NextResponse.json(
      { error: "Missing Cal.com API configuration" },
      { status: 500 }
    );
  }

  try {
    const body: CreateEventTypeRequest = await request.json();
    const { primaryLeadId, additionalLeadId, agentName, hosts, isInPersonMeeting, address, specialization } = body;

    // Validate hosts
    if (!hosts || hosts.length === 0) {
      return NextResponse.json(
        { error: "At least one host with userId is required" },
        { status: 400 }
      );
    }

    // Generate a unique slug (short and unique)
    const timestamp = Date.now().toString(36);
    const slug = `meeting-${timestamp}`;

    // Build title - Hebrew, concise, with lead number and agent name
    const leadInfo = additionalLeadId 
      ? `לידים ${primaryLeadId}, ${additionalLeadId}`
      : `ליד ${primaryLeadId}`;
    const agentInfo = agentName ? ` - ${agentName}` : "";
    const title = `פגישה ${leadInfo}${agentInfo}`;

    // Fixed description - super concise
    const description = isInPersonMeeting && address
      ? `פגישת ייעוץ פרונטלית בכתובת: ${address}`
      : "פגישת ייעוץ";

    // Build booking fields - only include fields with actual values
    const bookingFields = [
      // Primary lead ID is always required
      {
        slug: "primaryLeadId",
        type: "text",
        label: "מספר ליד ראשי",
        defaultValue: primaryLeadId,
        hidden: true,
        required: true,
      },
      // isInPersonMeeting is always included (boolean flag)
      {
        slug: "isInPersonMeeting",
        type: "text",
        label: "פגישה פרונטלית",
        defaultValue: isInPersonMeeting ? "true" : "false",
        hidden: true,
        required: true,
      },
    ];

    // Only add additionalLeadId if it has a value
    if (additionalLeadId) {
      bookingFields.push({
        slug: "additionalLeadId",
        type: "text",
        label: "מספר ליד נוסף",
        defaultValue: additionalLeadId,
        hidden: true,
        required: false,
      });
    }

    // Only add address if it has a value
    if (address) {
      bookingFields.push({
        slug: "address",
        type: "text",
        label: "כתובת",
        defaultValue: address,
        hidden: true,
        required: false,
      });
    }

    // Only add specialization if it has a value
    if (specialization) {
      bookingFields.push({
        slug: "specialization",
        type: "text",
        label: "התמחות",
        defaultValue: specialization,
        hidden: true,
        required: false,
      });
    }

    // Build Cal.com API request
    const eventTypePayload = {
      lengthInMinutes: 30,
      title,
      slug,
      description,
      schedulingType: "ROUND_ROBIN",
      hosts: hosts.map((h) => ({
        userId: Number(h.userId),
        weight: 100, // Fixed weight for all
      })),
      bookingFields,
    };

    // Create event type via Cal.com API v2
    const calcomResponse = await fetch(
      `https://api.cal.com/v2/teams/${CALCOM_TEAM_ID}/event-types`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CALCOM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventTypePayload),
      }
    );

    if (!calcomResponse.ok) {
      const errorData = await calcomResponse.text();
      console.error("Cal.com API error:", errorData);
      return NextResponse.json(
        { error: "Failed to create event type in Cal.com", details: errorData },
        { status: calcomResponse.status }
      );
    }

    const calcomData: CalcomEventTypeResponse = await calcomResponse.json();

    // Return the booking link for the team event type (uses team slug, not ID)
    const bookingLink = `team/${CALCOM_TEAM_SLUG}/${calcomData.data.slug}`;

    return NextResponse.json({
      success: true,
      eventTypeId: calcomData.data.id,
      slug: calcomData.data.slug,
      bookingLink,
      title: calcomData.data.title,
    });
  } catch (error) {
    console.error("Error creating Cal.com event type:", error);
    return NextResponse.json(
      { error: "Failed to create event type" },
      { status: 500 }
    );
  }
}

