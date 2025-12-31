import { z } from "zod";

// Agent selection mode: "auto" | "manual"
export const agentSelectionModes = ["auto", "manual"] as const;
export type AgentSelectionMode = (typeof agentSelectionModes)[number];

export const leadFormSchema = z
  .object({
    primaryLeadNumber: z
      .string()
      .min(1, "יש להזין מספר ליד"),
    isCouplesMeeting: z.boolean(),
    additionalLeadNumber: z.string().optional().or(z.literal("")),
    isInPersonMeeting: z.boolean(),
    address: z.string().optional().or(z.literal("")),
    agentSelectionMode: z.enum(agentSelectionModes),
    specializationForManualMode: z.string().optional().or(z.literal("")),
    agentId: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      // If couples meeting is enabled, additional lead ID is required (min 1 char)
      if (data.isCouplesMeeting) {
        return data.additionalLeadNumber && data.additionalLeadNumber.length >= 1;
      }
      return true;
    },
    {
      message: "יש להזין מספר ליד נוסף",
      path: ["additionalLeadNumber"],
    }
  )
  .refine(
    (data) => {
      // If in-person meeting is enabled, address is required (min 1 char)
      if (data.isInPersonMeeting) {
        return data.address && data.address.length >= 1;
      }
      return true;
    },
    {
      message: "יש להזין כתובת",
      path: ["address"],
    }
  )
  .refine(
    (data) => {
      // Manual selection mode: must select an agent
      if (data.agentSelectionMode === "manual") {
        return data.agentId && data.agentId.length >= 1;
      }
      return true;
    },
    {
      message: "יש לבחור סוכן",
      path: ["agentId"],
    }
  );

// Schema for Part 1 validation only
export const leadFormPart1Schema = z
  .object({
    primaryLeadNumber: z
      .string()
      .min(1, "יש להזין מספר ליד"),
    isCouplesMeeting: z.boolean(),
    additionalLeadNumber: z.string().optional().or(z.literal("")),
    isInPersonMeeting: z.boolean(),
    address: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.isCouplesMeeting) {
        return data.additionalLeadNumber && data.additionalLeadNumber.length >= 1;
      }
      return true;
    },
    {
      message: "יש להזין מספר ליד נוסף",
      path: ["additionalLeadNumber"],
    }
  )
  .refine(
    (data) => {
      if (data.isInPersonMeeting) {
        return data.address && data.address.length >= 1;
      }
      return true;
    },
    {
      message: "יש להזין כתובת",
      path: ["address"],
    }
  );

export type LeadFormData = z.infer<typeof leadFormSchema>;
export type LeadFormPart1Data = z.infer<typeof leadFormPart1Schema>;
