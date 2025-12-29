export interface Agent {
  id: string;
  name: string;
  email?: string;
  userId?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  weight?: number;
  phone?: string;
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
  hosts: { userId: number; weight: number; dailyLimit?: number; email?: string }[];
  isInPersonMeeting?: boolean;
  address?: string;
}

export interface CreateEventTypeResponse {
  success: boolean;
  eventTypeId: number;
  slug: string;
  bookingLink: string;
  title: string;
}

export interface CalcomBookingHost {
  id: number;
  name: string;
  email: string;
  username: string;
  timeZone: string;
}

export interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  hosts: CalcomBookingHost[];
  status: string;
  start: string;
  end: string;
}

export interface BookingsResponse {
  hostUserIds: number[];
}

export interface ValidatedLead {
  number: number;
  id?: number;
  customerId?: number;
  fullName: string;
  email?: string;
  interestName?: string;
}

export interface ValidateLeadsRequest {
  primaryLeadNumber: string;
  additionalLeadNumber?: string;
}

export interface ValidateLeadsResponse {
  success: boolean;
  error?: string;
  primaryLead?: ValidatedLead;
  additionalLead?: ValidatedLead;
}

export interface BookingDetails {
  agentName: string;
  startTime: string;
  endTime: string;
}
