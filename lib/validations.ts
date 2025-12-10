import { z } from "zod";

export const leadFormSchema = z
  .object({
    primaryLeadId: z
      .string()
      .min(1, "יש להזין מספר ליד"),
    isCouplesMeeting: z.boolean(),
    additionalLeadId: z.string().optional().or(z.literal("")),
    isInPersonMeeting: z.boolean(),
    address: z.string().optional().or(z.literal("")),
    specialization: z.string().optional().or(z.literal("")),
    agentId: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      // If couples meeting is enabled, additional lead ID is required (min 1 char)
      if (data.isCouplesMeeting) {
        return data.additionalLeadId && data.additionalLeadId.length >= 1;
      }
      return true;
    },
    {
      message: "יש להזין מספר ליד נוסף",
      path: ["additionalLeadId"],
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
      // If specialization is selected, agent is required
      if (data.specialization && data.specialization.length > 0) {
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
    primaryLeadId: z
      .string()
      .min(1, "יש להזין מספר ליד"),
    isCouplesMeeting: z.boolean(),
    additionalLeadId: z.string().optional().or(z.literal("")),
    isInPersonMeeting: z.boolean(),
    address: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.isCouplesMeeting) {
        return data.additionalLeadId && data.additionalLeadId.length >= 1;
      }
      return true;
    },
    {
      message: "יש להזין מספר ליד נוסף",
      path: ["additionalLeadId"],
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
