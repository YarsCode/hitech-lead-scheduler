import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ValidateLeadsResponse, ValidatedLead } from "@/lib/types";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_WEBHOOK_AUTH = process.env.N8N_WEBHOOK_AUTH;

const LEADS_NOT_FOUND_ERROR = "מספר/י הליד/ים לא נמצאו, או שיש תקלה זמנית במערכת";

const validateLeadsSchema = z.object({
  primaryLeadNumber: z.string().min(1).max(50),
  additionalLeadNumber: z.string().max(50).nullish(),
});

interface WebhookLeadResult {
  number: number;
  id?: string;
  customerId?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  interestName?: string;
  cellNumber?: string;
  idNumber?: string;
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
    cellNumber: lead.cellNumber,
    idNumber: lead.idNumber,
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
    const parsed = validateLeadsSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json<ValidateLeadsResponse>(
        { success: false, error: "חסר מספר ליד ראשי" },
        { status: 400 }
      );
    }

    const { primaryLeadNumber, additionalLeadNumber } = parsed.data;

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
