"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { leadFormSchema, leadFormPart1Schema, type LeadFormData, type AgentSelectionMode } from "@/lib/validations";
import type { Agent, ValidateLeadsResponse, ValidatedLead, BookingDetails, SpouseMeetingResponse } from "@/lib/types";
import { useSpecializations } from "@/hooks/useSpecializations";
import { useAgents } from "@/hooks/useAgents";
import { CalendarPopup } from "./CalendarPopup";
import { getCurrentUser } from "./LoginGate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { SearchableSelect } from "./ui/SearchableSelect";
import { TextInput } from "./ui/TextInput";
import { SummaryItem } from "./ui/SummaryItem";
import { ToggleButton } from "./ui/ToggleButton";
import { RadioGroup } from "./ui/RadioGroup";
import { Loader2, Calendar, Users, UserPlus, MapPin, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";

function getHebrewDayName(date: Date): string {
  return date.toLocaleDateString("he-IL", { weekday: "long" });
}

export function LeadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const hasDocumentedAssignment = useRef(false);
  const [currentPart, setCurrentPart] = useState<1 | 2>(1);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingLink, setBookingLink] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);

  // Lead validation state
  const [isValidatingLeads, setIsValidatingLeads] = useState(false);
  const [leadValidationError, setLeadValidationError] = useState<string>("");
  const [validatedPrimaryLead, setValidatedPrimaryLead] = useState<ValidatedLead | null>(null);
  const [validatedAdditionalLead, setValidatedAdditionalLead] = useState<ValidatedLead | null>(null);

  // Agent availability error (for auto mode)
  const [agentAvailabilityError, setAgentAvailabilityError] = useState<string>("");

  // Spouse booking data (agent email and eventTypeId for the primary lead)
  const [spouseMeetingData, setSpouseMeetingData] = useState<{
    agentEmail: string;
    eventTypeId?: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isValid },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    mode: "onChange",
    defaultValues: {
      primaryLeadNumber: "",
      isCouplesMeeting: false,
      additionalLeadNumber: "",
      isInPersonMeeting: false,
      address: "",
      agentSelectionMode: "auto" as AgentSelectionMode,
      specializationForManualMode: "",
      agentId: "",
    },
  });

  const isCouplesMeeting = watch("isCouplesMeeting");
  const isInPersonMeeting = watch("isInPersonMeeting");
  const primaryLeadNumber = watch("primaryLeadNumber");
  const additionalLeadNumber = watch("additionalLeadNumber");
  const address = watch("address");
  const agentSelectionMode = watch("agentSelectionMode");
  const specializationForManualMode = watch("specializationForManualMode");
  const agentId = watch("agentId");

  const activeSpecialization = agentSelectionMode === "manual" ? specializationForManualMode : "";

  const { specializations, loading: loadingSpecializations } = useSpecializations();
  const { agents, loading: loadingAgents } = useAgents(activeSpecialization ?? "", false, agentSelectionMode === "manual");
  
  // Filter agents to only those with a Cal.com userId (required for booking)
  const agentsWithUserId = agents.filter((agent) => agent.userId !== undefined && agent.userId !== null);

  // Delete event type helper function
  const deleteEventType = useCallback(async (id: number | null) => {
    if (!id) return;
    
    try {
      await fetch(`/api/calcom/delete?eventTypeId=${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Error deleting event type:", error);
    }
  }, []);

  // Clear selected agent when manual mode specialization changes
  useEffect(() => {
    if (agentSelectionMode === "manual") {
      setValue("agentId", "");
      setSelectedAgent(null);
    }
  }, [specializationForManualMode, agentSelectionMode, setValue]);

  // Clear agent availability error when specialization changes
  useEffect(() => {
    setAgentAvailabilityError("");
  }, [specializationForManualMode]);

  // Handle agent selection mode change
  const handleAgentSelectionModeChange = (value: string) => {
    const mode = value as AgentSelectionMode;
    setValue("agentSelectionMode", mode, { shouldValidate: true });
    
    // Clear agent availability error when changing modes
    setAgentAvailabilityError("");
    
    // Clear fields when switching modes
    if (mode === "auto") {
      setValue("specializationForManualMode", "", { shouldValidate: true });
      setValue("agentId", "", { shouldValidate: true });
      setSelectedAgent(null);
    }
    // Manual mode doesn't need to clear anything
  };

  const toggleCouplesMeeting = () => {
    const newValue = !isCouplesMeeting;
    setValue("isCouplesMeeting", newValue, { shouldValidate: true });
    if (!newValue) {
      setValue("additionalLeadNumber", "", { shouldValidate: true });
    }
  };

  const toggleInPersonMeeting = () => {
    const newValue = !isInPersonMeeting;
    setValue("isInPersonMeeting", newValue, { shouldValidate: true });
    if (!newValue) {
      setValue("address", "", { shouldValidate: true });
    }
  };

  // Validate Part 1 fields before proceeding
  const validatePart1 = useCallback(async (): Promise<boolean> => {
    const part1Data = {
      primaryLeadNumber,
      isCouplesMeeting,
      additionalLeadNumber,
      isInPersonMeeting,
      address,
    };
    
    const result = leadFormPart1Schema.safeParse(part1Data);
    
    // Trigger validation on all Part 1 fields
    await trigger(["primaryLeadNumber", "additionalLeadNumber", "address"]);
    
    return result.success;
  }, [primaryLeadNumber, isCouplesMeeting, additionalLeadNumber, isInPersonMeeting, address, trigger]);

  const handleContinueToPart2 = useCallback(async () => {
    const isValid = await validatePart1();
    if (!isValid) return;

    // Clear previous state
    setLeadValidationError("");
    setSpouseMeetingData(null);
    setIsValidatingLeads(true);

    try {
      // Validate leads
      const response = await fetch("/api/validate-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryLeadNumber,
          additionalLeadNumber: isCouplesMeeting ? additionalLeadNumber : undefined,
        }),
      });

      const data: ValidateLeadsResponse = await response.json();

      if (!data.success) {
        setLeadValidationError(data.error || "מספר/י הליד/ים לא נמצאו, או שיש תקלה זמנית במערכת");
        return;
      }

      // Store validated lead info for Cal.com prefill
      setValidatedPrimaryLead(data.primaryLead || null);
      setValidatedAdditionalLead(data.additionalLead || null);

      // If spouse toggle is ON, fetch the agent associated with the spouse lead
      if (isCouplesMeeting && data.additionalLead?.id) {
        const spouseResponse = await fetch("/api/spouse-meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: data.additionalLead.id }),
        });

        const spouseData: SpouseMeetingResponse = await spouseResponse.json();

        if (spouseData.success && spouseData.agentEmail) {
          setSpouseMeetingData({ agentEmail: spouseData.agentEmail, eventTypeId: spouseData.eventTypeId });
          setIsValidatingLeads(false);
          return;
        }

        // No agent found - show error and stay on Part 1
        setLeadValidationError(spouseData.error || "לא נמצא סוכן משויך לליד הראשי");
        return;
      }

      setCurrentPart(2);
    } catch (error) {
      console.error("Error validating leads:", error);
      setLeadValidationError("מספר/י הליד/ים לא נמצאו, או שיש תקלה זמנית במערכת");
    } finally {
      setIsValidatingLeads(false);
    }
  }, [validatePart1, primaryLeadNumber, additionalLeadNumber, isCouplesMeeting]);

  // Handle Enter key to continue from Part 1
  useEffect(() => {
    if (currentPart !== 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        handleContinueToPart2();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentPart, handleContinueToPart2]);

  // Handle Enter key to submit from Part 2
  useEffect(() => {
    if (currentPart !== 2 || showCalendar) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" && isValid && !isSubmitting) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentPart, showCalendar, isValid, isSubmitting]);

  const handleBackToPart1 = () => {
    setCurrentPart(1);
  };

  const handleAgentChange = (agentId: string) => {
    setValue("agentId", agentId, { shouldValidate: true });
    const agent = agentsWithUserId.find((a) => a.id === agentId) || null;
    setSelectedAgent(agent);
  };

  const showErrorModal = (message: string) => {
    setErrorModal({ open: true, message });
  };

  const documentManualAssignment = (agentName: string) => {
    if (hasDocumentedAssignment.current) return;
    hasDocumentedAssignment.current = true;

    const currentUser = getCurrentUser();
    if (currentUser?.username && agentName) {
      fetch("/api/document-manual-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser.username,
          agentName,
        }),
      }).catch((error) => {
        console.error("Error documenting manual assignment:", error);
      });
    }
  };

  // Fetch hosts based on agent selection mode
  const fetchHosts = async (data: LeadFormData): Promise<{ userId: number; weight: number; email?: string; dailyLimit?: number }[]> => {
    // Manual mode - use selected agent
    if (data.agentId) {
      const agent = agentsWithUserId.find((a) => a.id === data.agentId);
      return agent?.userId 
        ? [{ userId: agent.userId, weight: agent.weight ?? 100, email: agent.email, dailyLimit: agent.dailyLimit }] 
        : [];
    }
    
    // Auto mode - fetch with even distribution filter and interest-based filtering
    const params = new URLSearchParams();
    // Pass lead's interest to filter agents by their specialization exclusions
    if (validatedPrimaryLead?.interestName) {
      params.set("interest", validatedPrimaryLead.interestName);
    }
    params.set("evenDistribution", "true");
    
    const res = await fetch(`/api/agents?${params}`);
    if (!res.ok) throw new Error("Failed to fetch agents");
    
    const agentsData = await res.json();
    const schedulableAgents = (agentsData.agents || []).filter(
      (a: Agent) => a.userId != null
    );
        
    return schedulableAgents.map((a: Agent) => ({ 
      userId: a.userId!, 
      weight: a.weight ?? 100, 
      email: a.email,
      dailyLimit: a.dailyLimit,
    }));
  };

  const createCalcomEventType = async (data: LeadFormData, hosts: { userId: number; weight: number }[], isSpouseBooking = false, eventTypeId?: string) => {
    const response = await fetch("/api/calcom/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryLeadNumber: data.primaryLeadNumber,
        additionalLeadNumber: data.additionalLeadNumber,
        leadId: validatedPrimaryLead?.id,
        additionalLeadId: validatedAdditionalLead?.id,
        customerId: validatedPrimaryLead?.customerId,
        additionalCustomerId: validatedAdditionalLead?.customerId,
        customerFullName: validatedPrimaryLead?.fullName,
        customerEmail: validatedPrimaryLead?.email,
        additionalCustomerFullName: validatedAdditionalLead?.fullName,
        additionalCustomerEmail: validatedAdditionalLead?.email,
        agentName: selectedAgent?.name,
        agentPhone: selectedAgent?.phone,
        interestName: validatedPrimaryLead?.interestName,
        hosts,
        isInPersonMeeting: data.isInPersonMeeting,
        address: data.address,
        customerCellNumber: validatedPrimaryLead?.cellNumber,
        additionalCustomerCellNumber: validatedAdditionalLead?.cellNumber,
        customerIdNumber: validatedPrimaryLead?.idNumber,
        isSpouseBooking,
        bookedByUsername: getCurrentUser()?.username,
        eventTypeId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Failed to create event type:", errorData);
      throw new Error("Failed to create event type");
    }

    return response.json();
  };

  // Handle spouse booking when meeting data is found (skips Part 2)
  useEffect(() => {
    if (!spouseMeetingData) return;

    const handleSpouseBooking = async () => {
      setIsSubmitting(true);
      try {
        // Fetch all agents (bypass filters for spouse booking - ignore traffic light & limits)
        const agentsResponse = await fetch("/api/agents?bypassFilters=true");
        const agentsData = await agentsResponse.json();
        const allAgents: Agent[] = agentsData.agents || [];

        const matchedAgent = allAgents.find(
          (a) => a.email?.toLowerCase() === spouseMeetingData.agentEmail.toLowerCase()
        );

        if (!matchedAgent?.userId) {
          showErrorModal("הסוכן המשויך לליד הראשי לא נמצא במערכת או שאין לו יומן פעיל.");
          setSpouseMeetingData(null);
          setIsSubmitting(false);
          return;
        }

        setSelectedAgent(matchedAgent);

        // Delete all-day blocking event for this agent (Israel timezone)
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jerusalem",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const dateStr = formatter.format(now);
        const startDate = `${dateStr}T00:00:00`;
        const endDate = `${dateStr}T23:59:59`;
        
        await fetch("/api/delete-allday-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: matchedAgent.email,
            startDate,
            endDate,
          }),
        }).catch(() => {
          // Continue even if delete fails (non-blocking)
        });

        // Create event type with this specific agent (no buffers or limits for spouse booking)
        const hosts = [{ userId: matchedAgent.userId, weight: 100, email: matchedAgent.email }];
        const result = await createCalcomEventType(
          {
            primaryLeadNumber,
            additionalLeadNumber,
            isCouplesMeeting: true,
            isInPersonMeeting,
            address,
            agentSelectionMode: "manual",
            specializationForManualMode: "",
            agentId: matchedAgent.id,
          },
          hosts,
          true, // isSpouseBooking - no buffers
          spouseMeetingData.eventTypeId // first lead's eventTypeId to remove its buffer
        );

        setBookingLink(result.bookingLink);
        setEventTypeId(result.eventTypeId);
        setShowCalendar(true);
      } catch (error) {
        console.error("Error creating spouse booking:", error);
        showErrorModal("אירעה שגיאה בטעינת היומן. אנא נסה שוב.");
        setSpouseMeetingData(null);
      } finally {
        setIsSubmitting(false);
      }
    };

    handleSpouseBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spouseMeetingData]);

  const onSubmit = async (data: LeadFormData) => {
    setIsSubmitting(true);
    setAgentAvailabilityError("");
    
    try {
      const hosts = await fetchHosts(data);
      
      if (hosts.length === 0) {
        showErrorModal("לא נמצאו סוכנים זמינים לתיאום פגישה.");
        return;
      }

      const result = await createCalcomEventType(data, hosts);
      setBookingLink(result.bookingLink);
      setEventTypeId(result.eventTypeId);
      setShowCalendar(true);
    } catch (error) {
      console.error("Error creating event type:", error);
      showErrorModal("אירעה שגיאה. אנא נסה שוב.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookingSuccess = useCallback(async (details: BookingDetails) => {
    setEventTypeId(null);
    setShowCalendar(false);
    setBookingDetails(details);
    setBookingComplete(true);

    if (agentSelectionMode === "manual") {
      documentManualAssignment(details.agentName);
    }
  }, [agentSelectionMode]);

  const handleBookingError = useCallback(async () => {
    await deleteEventType(eventTypeId);
    setEventTypeId(null);
    setShowCalendar(false);
    setErrorModal({
      open: true,
      message: "אירעה שגיאה בקביעת הפגישה. אנא נסה שוב.",
    });
  }, [eventTypeId, deleteEventType]);

  const handleBackToForm = async () => {
    await deleteEventType(eventTypeId);
    setEventTypeId(null);
    setBookingLink("");
    setShowCalendar(false);
    setSpouseMeetingData(null);
    setSelectedAgent(null);
  };

  return (
    <div className={cn("relative mx-auto w-full transition-all", showCalendar ? "max-w-5xl" : "max-w-xl")}>
      {/* Content wrapper with blur effect */}
      <div className={cn(
        "transition-all duration-300",
        bookingComplete && "pointer-events-none blur-sm select-none"
      )}>
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="font-medium text-primary">תיאום פגישה חדשה</span>
          </div>
          <h1 className="text-3xl font-bold text-primary">
            הייטק סוכנות לביטוח
          </h1>
          <p className="mt-2 text-gray-500">
            מלא את הפרטים ובחר סוכן לתיאום פגישה
          </p>
        </div>

        {/* Progress indicator - 2 steps */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
            currentPart >= 1 ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
          )}>
            {currentPart > 1 || showCalendar ? <CheckCircle className="h-5 w-5" /> : "1"}
          </div>
          <div className={cn(
            "h-1 w-12 rounded-full transition-colors",
            currentPart >= 2 || showCalendar ? "bg-primary" : "bg-gray-200"
          )} />
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
            currentPart >= 2 || showCalendar ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
          )}>
            {showCalendar ? <CheckCircle className="h-5 w-5" /> : "2"}
          </div>
        </div>

        {showCalendar && bookingLink ? (
        <div className="space-y-4">
          <button
            onClick={handleBackToForm}
            className="cursor-pointer text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
          >
            → חזרה לטופס
          </button>
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-accent/20 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-primary">
                  {selectedAgent ? selectedAgent.name : "בחירת סוכן זמין"}
                </p>
                <p className="text-sm text-gray-500">בחר מועד מהיומן</p>
              </div>
            </div>
            <CalendarPopup
              bookingLink={bookingLink}
              prefillData={{
                name: validatedPrimaryLead?.fullName,
                email: validatedPrimaryLead?.email,
                additionalEmail: validatedAdditionalLead?.email,
              }}
              onBookingSuccess={handleBookingSuccess}
              onBookingError={handleBookingError}
            />
          </div>
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 rounded-2xl bg-white p-6 shadow-lg sm:p-8"
        >
          {/* Part 1: Lead Information */}
          {currentPart === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="mb-4 border-b border-gray-100 pb-3">
                <h2 className="text-xl font-semibold text-primary">פרטי הליד</h2>
                <p className="text-base text-gray-500">הזן את פרטי הליד לפגישה</p>
              </div>

              {/* Primary Lead ID */}
              <TextInput
                {...register("primaryLeadNumber")}
                label="מספר ליד*"
                error={errors.primaryLeadNumber?.message}
                placeholder="הזן מספר ליד"
                autoFocus
              />

              {/* Spouse Lead ID (conditional) */}
              {isCouplesMeeting && (
                <TextInput
                  {...register("additionalLeadNumber")}
                  label="מספר ליד בן/בת הזוג שכבר תואם*"
                  error={errors.additionalLeadNumber?.message}
                  placeholder="הזן מספר ליד בן/בת הזוג"
                  className="animate-slide-down"
                  autoFocus
                />
              )}

              {/* Spouse Toggle */}
              <div className="space-y-3">
                <ToggleButton
                  label="בן/בת זוג"
                  icon={UserPlus}
                  checked={isCouplesMeeting}
                  onToggle={toggleCouplesMeeting}
                />
              </div>

              <div className="border-t border-gray-300" />

              {/* In-Person Meeting Toggle */}
              <div className="space-y-3">
                <ToggleButton
                  label="פגישה פרונטלית"
                  icon={MapPin}
                  checked={isInPersonMeeting}
                  onToggle={toggleInPersonMeeting}
                />
              </div>

              {/* Address (conditional) */}
              {isInPersonMeeting && (
                <TextInput
                  {...register("address")}
                  label="כתובת לפגישה*"
                  error={errors.address?.message}
                  placeholder="הזן כתובת מלאה"
                  className="animate-slide-down"
                />
              )}

              {/* Lead Validation Error */}
              {leadValidationError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {leadValidationError}
                </div>
              )}

              {/* Continue Button */}
              <button
                type="button"
                onClick={handleContinueToPart2}
                disabled={isValidatingLeads}
                className={cn(
                  "mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-4 text-lg font-semibold text-white",
                  "hover:bg-primary/90 active:scale-[0.98]",
                  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                {isValidatingLeads ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>מאמת פרטים...</span>
                  </>
                ) : (
                  <>
                    <span>המשך</span>
                    <ArrowLeft className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Part 2: Agent Selection & Summary */}
          {currentPart === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="mb-4 border-b border-gray-100 pb-3">
                <h2 className="text-xl font-semibold text-primary">הקצאת סוכן</h2>
                <p className="text-base text-gray-500">בחר כיצד להקצות סוכן לפגישה</p>
              </div>

              {/* Summary of Part 1 */}
              <div className="rounded-xl bg-gray-50 p-4">
                <h3 className="mb-3 text-base font-medium text-gray-700">סיכום פרטי הליד</h3>
                <div className="border-t border-gray-300 mb-3" />
                <div className="space-y-1">
                  <SummaryItem 
                    label="ליד" 
                    value={validatedPrimaryLead?.fullName 
                      ? `${validatedPrimaryLead.fullName} - ${primaryLeadNumber}` 
                      : primaryLeadNumber} 
                  />
                  {isCouplesMeeting && additionalLeadNumber && (
                    <SummaryItem 
                      label="ליד בן/בת הזוג" 
                      value={validatedAdditionalLead?.fullName 
                        ? `${validatedAdditionalLead.fullName} - ${additionalLeadNumber}` 
                        : additionalLeadNumber} 
                    />
                  )}
                  <SummaryItem 
                    label="סוג פגישה" 
                    value={isInPersonMeeting ? "פגישה פרונטלית" : "פגישה מרחוק"} 
                  />
                  {isInPersonMeeting && address && (
                    <SummaryItem label="כתובת" value={address} />
                  )}
                </div>
              </div>

              {/* Agent Selection Mode - Individual radio buttons with their own selects */}
              <div className="space-y-3">
                {/* Option 1: Auto */}
                <RadioGroup
                  options={[{ value: "auto", label: "הקצאה אוטומטית", description: "הפגישה תוקצה לסוכן זמין באופן אוטומטי" }]}
                  value={agentSelectionMode}
                  onChange={handleAgentSelectionModeChange}
                />

                {/* Option 2: Manual */}
                <RadioGroup
                  options={[{ value: "manual", label: "בחירת סוכן ידנית", description: "בחר סוכן ספציפי לפגישה" }]}
                  value={agentSelectionMode}
                  onChange={handleAgentSelectionModeChange}
                />

                {/* Specialization & Agent selects for Manual mode */}
                {agentSelectionMode === "manual" && (
                  <div className="space-y-5 animate-slide-down">
                    <SearchableSelect
                      label="התמחות"
                      options={[
                        { value: "", label: "הכל" },
                        ...specializations.map((s) => ({ value: s.name, label: s.name }))
                      ]}
                      value={specializationForManualMode || ""}
                      onChange={(value) => setValue("specializationForManualMode", value, { shouldValidate: true })}
                      placeholder="סנן לפי התמחות"
                      loadingPlaceholder="טוען..."
                      emptyPlaceholder="אין התמחויות"
                      noResultsText="לא נמצאו תוצאות"
                      disabled={loadingSpecializations}
                      loading={loadingSpecializations}
                      error={errors.specializationForManualMode?.message}
                    />
                    <SearchableSelect
                      label="סוכן*"
                      options={agentsWithUserId.map((agent) => ({ value: agent.id, label: agent.name }))}
                      value={agentId || ""}
                      onChange={handleAgentChange}
                      placeholder="בחר סוכן"
                      loadingPlaceholder="טוען סוכנים..."
                      emptyPlaceholder="לא נמצאו סוכנים זמינים"
                      noResultsText="לא נמצאו תוצאות"
                      disabled={loadingAgents}
                      loading={loadingAgents}
                      error={errors.agentId?.message}
                    />
                  </div>
                )}
              </div>

              {/* Agent Availability Error */}
              {agentAvailabilityError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {agentAvailabilityError}
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleBackToPart1}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-border bg-white py-4 font-semibold text-gray-600",
                    "hover:border-primary hover:text-primary active:scale-[0.98]",
                    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  )}
                >
                  <ArrowRight className="h-5 w-5" />
                  <span>חזרה</span>
                </button>
                <button
                  type="submit"
                  disabled={!isValid || isSubmitting}
                  className={cn(
                    "flex flex-[2] cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-4 text-lg font-semibold text-white",
                    "hover:bg-primary/90 active:scale-[0.98]",
                    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>טוען...</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="h-5 w-5" />
                      <span>קביעת פגישה</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </form>
      )}
      </div>

      {/* Success overlay */}
      {bookingComplete && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="animate-fade-in rounded-2xl bg-white p-8 shadow-xl text-center space-y-6 max-w-lg w-full">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-primary">הפגישה נקבעה בהצלחה</h2>
              <p className="mt-2 text-gray-500">פרטי הפגישה נשלחו למייל.</p>
            </div>

            {/* Meeting Details */}
            <div className="rounded-xl bg-gray-50 p-5 text-right">
              <div className="flex items-center justify-between border-b border-gray-100 py-3">
                <span className="text-sm text-gray-500">סוכן/ת</span>
                <span className="font-medium text-primary">{bookingDetails?.agentName || "-"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 py-3">
                <span className="text-sm text-gray-500">לקוח/ה</span>
                <span className="font-medium text-primary">{validatedPrimaryLead?.fullName || "-"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 py-3">
                <span className="text-sm text-gray-500">תאריך ושעה</span>
                <span className="font-medium text-primary" dir="ltr">
                  {bookingDetails?.startTime && bookingDetails?.endTime ? (
                    <>
                      {format(new Date(bookingDetails.startTime), "HH:mm")} - {format(new Date(bookingDetails.endTime), "HH:mm")}
                      <span className="mx-2">●</span>
                      <span dir="rtl">{getHebrewDayName(new Date(bookingDetails.startTime))}</span>
                      <span className="mx-2">●</span>
                      {format(new Date(bookingDetails.startTime), "dd.MM.yyyy")}
                    </>
                  ) : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-gray-500">מיקום</span>
                <span className="font-medium text-primary">
                  {isInPersonMeeting ? address || "-" : "פגישה מרחוק"}
                </span>
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-primary py-4 text-lg font-semibold text-white transition-all hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              תיאום פגישה נוספת
            </button>
          </div>
        </div>
      )}

      {/* Error modal */}
      <Dialog open={errorModal.open} onOpenChange={(open) => setErrorModal({ ...errorModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl text-red-600">שגיאה</DialogTitle>
            <DialogDescription className="text-base">{errorModal.message}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
