export interface Agent {
  id: string;
  name: string;
  userId?: number; // Cal.com user ID - only agents with this can be scheduled
}

export interface AgentsResponse {
  agents: Agent[];
}

export interface Specialization {
  id: string;
  name: string;
}

export interface SpecializationsResponse {
  specializations: Specialization[];
}

export interface CreateEventTypeRequest {
  primaryLeadId: string;
  additionalLeadId?: string;
  agentName?: string;
  hosts: { userId: number; weight: number }[];
  isInPersonMeeting?: boolean;
  address?: string;
  specialization?: string;
}

export interface CreateEventTypeResponse {
  success: boolean;
  eventTypeId: number;
  slug: string;
  bookingLink: string;
  title: string;
}
