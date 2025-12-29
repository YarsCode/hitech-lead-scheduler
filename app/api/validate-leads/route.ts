import { NextRequest, NextResponse } from "next/server";
import type { ValidateLeadsRequest, ValidateLeadsResponse, ValidatedLead } from "@/lib/types";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_WEBHOOK_AUTH = process.env.N8N_WEBHOOK_AUTH;

const LEADS_NOT_FOUND_ERROR = "מספר/י הליד/ים לא נמצאו, או שיש תקלה זמנית במערכת";

interface WebhookLeadResult {
  number: number;
  id?: number;
  customerId?: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  interestName?: string;
}

interface WebhookResponse {
  results: WebhookLeadResult[];
  hasNextPage: boolean;
  totalElements: number;
}

function buildValidatedLead(lead: WebhookLeadResult): ValidatedLead {
  return {
    number: lead.number,
    id: lead.id,
    customerId: lead.customerId,
    fullName: lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim(),
    email: lead.email,
    interestName: lead.interestName,
  };
}

export async function POST(request: NextRequest) {
  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_AUTH) {
    console.error("Missing N8N webhook configuration");
    return NextResponse.json<ValidateLeadsResponse>(
      { success: false, error: "שגיאה בהגדרות המערכת" },
      { status: 500 }
    );
  }

  try {
    const body: ValidateLeadsRequest = await request.json();
    const { primaryLeadNumber, additionalLeadNumber } = body;

    if (!primaryLeadNumber) {
      return NextResponse.json<ValidateLeadsResponse>(
        { success: false, error: "חסר מספר ליד ראשי" },
        { status: 400 }
      );
    }

    const webhookBody: Record<string, string> = { primaryLeadNumber };
    if (additionalLeadNumber) {
      webhookBody.additionalLeadNumber = additionalLeadNumber;
    }

    const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": N8N_WEBHOOK_AUTH,
      },
      body: JSON.stringify(webhookBody),
    });

    if (!webhookResponse.ok) {
      console.error(`Webhook error: ${webhookResponse.status}`);
      return NextResponse.json<ValidateLeadsResponse>({
        success: false,
        error: LEADS_NOT_FOUND_ERROR,
      });
    }

    const data: WebhookResponse = await webhookResponse.json();

    const primaryIdNum = parseInt(primaryLeadNumber);
    const additionalIdNum = additionalLeadNumber ? parseInt(additionalLeadNumber) : null;

    const primaryLeadResult = data.results.find((lead) => lead.number === primaryIdNum);
    const additionalLeadResult = additionalIdNum
      ? data.results.find((lead) => lead.number === additionalIdNum)
      : null;

    if (!primaryLeadResult || (additionalIdNum && !additionalLeadResult)) {
      return NextResponse.json<ValidateLeadsResponse>({
        success: false,
        error: LEADS_NOT_FOUND_ERROR,
      });
    }

    const response: ValidateLeadsResponse = {
      success: true,
      primaryLead: buildValidatedLead(primaryLeadResult),
    };

    if (additionalLeadResult) {
      response.additionalLead = buildValidatedLead(additionalLeadResult);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error validating leads:", error);
    return NextResponse.json<ValidateLeadsResponse>({
      success: false,
      error: LEADS_NOT_FOUND_ERROR,
    });
  }
}
