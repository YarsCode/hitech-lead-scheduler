import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_TEAM_ID = process.env.CALCOM_TEAM_ID;
const CALCOM_TEAM_SLUG = process.env.CALCOM_TEAM_SLUG

const hostSchema = z.object({
  userId: z.number().positive(),
  weight: z.number(),
  dailyLimit: z.number().nullish(),
  email: z.string().nullish(),
});

const createEventSchema = z.object({
  primaryLeadNumber: z.string().min(1),
  additionalLeadNumber: z.string().nullish(),
  leadId: z.string().nullish(),
  additionalLeadId: z.string().nullish(),
  customerId: z.string().nullish(),
  additionalCustomerId: z.string().nullish(),
  customerFullName: z.string().nullish(),
  customerEmail: z.string().nullish(),
  additionalCustomerFullName: z.string().nullish(),
  additionalCustomerEmail: z.string().nullish(),
  agentName: z.string().nullish(),
  agentPhone: z.string().nullish(),
  interestName: z.string().nullish(),
  hosts: z.array(hostSchema).min(1),
  isInPersonMeeting: z.boolean().nullish(),
  address: z.string().nullish(),
  customerCellNumber: z.string().nullish(),
  customerIdNumber: z.string().nullish(),
}).refine(
  (data) => !data.isInPersonMeeting || (data.address && data.address.trim() !== ""),
  { message: "Address is required for in-person meetings", path: ["address"] }
);


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
    const rawBody = await request.json();
    const parsed = createEventSchema.safeParse(rawBody);

    if (!parsed.success) {
      console.error("Validation failed:", JSON.stringify(parsed.error.issues, null, 2));
      console.error("Received body:", JSON.stringify(rawBody, null, 2));
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const { additionalLeadNumber, leadId, additionalLeadId, customerId, additionalCustomerId, customerFullName, customerEmail, additionalCustomerFullName, additionalCustomerEmail, agentName, agentPhone, interestName, hosts, isInPersonMeeting, address, customerCellNumber, customerIdNumber } = body;

    // Generate a unique slug (short and unique)
    const timestamp = Date.now().toString(36);
    const slug = `meeting-${timestamp}`;

    // Build title - used for both event type and email
    const title = `${customerFullName || "לקוח"}, פגישה עם ${agentName || "סוכן"} בנושא ${interestName || "ביטוח"}`;

    // Simple description for email - Cal.com will handle the details
    const description = `פגישה עם הייטק ביטוח`;

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
      customName: title,
      schedulingType: "ROUND_ROBIN",
      hosts: hosts.map((h) => ({
        userId: Number(h.userId),
        weight: h.weight,
      })),
      locations,
      metadata,
      bookingFields: [
        {
          type: "text",
          slug: "interest_name",
          label: "נושא הפגישה",
          required: true,
          hidden: false,
          disableOnPrefill: true,
        },
      ],
      bookingWindow: {
        type: "calendarDays",
        value: 21,
      },
      emailSettings: {
        disableEmailsToAttendees: true,
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

    // Build surense subject for webhook
    // Convert +972 prefix to 0 for cell number display
    const formattedCellNumber = customerCellNumber?.replace(/^\+972/, "0") || "";
    const meetingType = isInPersonMeeting ? "פרונטלית" : "מקוונת";
    const surenseSubject = `פגישה ${meetingType} עם ${agentName || "סוכן"} ללקוח ${customerFullName || "לקוח"} ${customerIdNumber || ""} (${formattedCellNumber})`;

    // Collect all metadata fields that should be passed as URL parameters
    // Customer emails are included here for webhook to send custom confirmation emails
    const metadataFields = {
      primaryLeadNumber: body.primaryLeadNumber,
      additionalLeadNumber,
      leadId: leadId?.toString(),
      additionalLeadId: additionalLeadId?.toString(),
      customerId: customerId?.toString(),
      additionalCustomerId: additionalCustomerId?.toString(),
      customerFullName,
      customerEmail,
      additionalCustomerFullName,
      additionalCustomerEmail,
      meetingAddress: isInPersonMeeting ? address : undefined,
      dailyLimits: Object.keys(dailyLimitsMap).length > 0 ? JSON.stringify(dailyLimitsMap) : undefined,
      surenseSubject,
    };
    
    // Build URL params from non-empty metadata fields
    const metadataParams = new URLSearchParams();
    Object.entries(metadataFields).forEach(([key, value]) => {
      if (value) {
        metadataParams.append(`metadata[${key}]`, value);
      }
    });
    
    // Prefill the interest_name booking field (direct param format for Cal.com)
    if (interestName) {
      metadataParams.append("interest_name", interestName);
    }
    
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

