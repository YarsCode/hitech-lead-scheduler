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
  leadId?: string;
  additionalLeadId?: string;
  customerId?: string;
  additionalCustomerId?: string;
  customerFullName?: string;
  customerEmail?: string;
  additionalCustomerFullName?: string;
  additionalCustomerEmail?: string;
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

export interface ValidatedLead {
  number: number;
  id?: string;
  customerId?: string;
  fullName: string;
  email?: string;
  interestName?: string;
  cellNumber?: string;
  idNumber?: string;
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

export interface User {
  username: string;
  name: string;
}

export interface SpouseMeetingResponse {
  success: boolean;
  agentEmail?: string;
  error?: string;
}
