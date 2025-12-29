import { NextRequest, NextResponse } from "next/server";

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;
const CALCOM_TEAM_SLUG = process.env.CALCOM_TEAM_SLUG

interface Host {
  userId: number;
  weight: number;
  dailyLimit?: number;
  email?: string;
}

interface CreateEventTypeRequest {
  primaryLeadNumber: string;
  additionalLeadNumber?: string;
  leadId?: number;
  additionalLeadId?: number;
  customerId?: number;
  additionalCustomerId?: number;
  customerFullName?: string;
  agentName?: string;
  agentPhone?: string;
  interestName?: string;
  hosts: Host[];
  isInPersonMeeting?: boolean;
  address?: string;
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
    // Note: primaryLeadNumber is in the request but not destructured - its value is prefilled by CalendarPopup
    const { additionalLeadNumber, leadId, additionalLeadId, customerId, additionalCustomerId, customerFullName, agentName, agentPhone, interestName, hosts, isInPersonMeeting, address } = body;

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

    // Build title - used for both event type and email
    const title = `${customerFullName || "לקוח"}, פגישה עם ${agentName || "סוכן"} בנושא ${interestName || "ביטוח"}`;

    // Simple description for email - Cal.com will handle the details
    const description = `היי,
נקבעה לנו שיחה במועד זה בנושא ${interestName || "ביטוח"} בתיק שלך.
אם יש שינוי בתוכניות – אפשר לעדכן כאן או ישירות בנייד שלי ${agentPhone || ""}

ניפגש!`;

    // Build locations array based on meeting type
    const locations = isInPersonMeeting && address
      ? [{ type: "address", address, public: true }]
      : [{ type: "integration", integration: "cal-video" }];

    // Store lead IDs, customer IDs, and address as metadata to pass to webhook without showing in email
    const metadata = {
      primaryLeadNumber: body.primaryLeadNumber,
      ...(additionalLeadNumber && { additionalLeadNumber }),
      ...(leadId && { leadId }),
      ...(additionalLeadId && { additionalLeadId }),
      ...(customerId && { customerId }),
      ...(additionalCustomerId && { additionalCustomerId }),
      ...(address && { address }),
    };

    // Build Cal.com API request - 60 min for couple meetings, 30 min for single
    const eventTypePayload = {
      lengthInMinutes: additionalLeadNumber ? 60 : 30,
      title,
      slug,
      description,
      customName: title, // Use description text as the custom event type name
      schedulingType: "ROUND_ROBIN",
      hosts: hosts.map((h) => ({
        userId: Number(h.userId),
        weight: h.weight,
      })),
      locations,
      metadata,
      bookingWindow: {
        type: "calendarDays",
        value: 21,
      },
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

    const baseBookingLink = `team/${CALCOM_TEAM_SLUG}/${calcomData.data.slug}`;
    
    // Build dailyLimits mapping from hosts (email -> dailyLimit)
    const dailyLimitsMap = Object.fromEntries(
      hosts.filter(h => h.email && h.dailyLimit !== undefined).map(h => [h.email, h.dailyLimit])
    );

    // Collect all metadata fields that should be passed as URL parameters
    const metadataFields = {
      primaryLeadNumber: body.primaryLeadNumber,
      additionalLeadNumber,
      leadId: leadId?.toString(),
      additionalLeadId: additionalLeadId?.toString(),
      customerId: customerId?.toString(),
      additionalCustomerId: additionalCustomerId?.toString(),
      meetingAddress: isInPersonMeeting ? address : undefined,
      dailyLimits: Object.keys(dailyLimitsMap).length > 0 ? JSON.stringify(dailyLimitsMap) : undefined,
    };
    
    // Build URL params from non-empty metadata fields
    const metadataParams = new URLSearchParams();
    Object.entries(metadataFields).forEach(([key, value]) => {
      if (value) {
        metadataParams.append(`metadata[${key}]`, value);
      }
    });
    
    const bookingLink = `${baseBookingLink}?${metadataParams.toString()}`;

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

