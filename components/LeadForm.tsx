"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { leadFormSchema, leadFormPart1Schema, type LeadFormData } from "@/lib/validations";
import type { Agent } from "@/lib/types";
import { useSpecializations } from "@/hooks/useSpecializations";
import { useAgents } from "@/hooks/useAgents";
import { CalendarPopup } from "./CalendarPopup";
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
import { Loader2, Calendar, Users, UserPlus, MapPin, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";

export function LeadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [currentPart, setCurrentPart] = useState<1 | 2>(1);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingLink, setBookingLink] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modal, setModal] = useState<{
    open: boolean;
    type: "success" | "error";
    message: string;
  }>({ open: false, type: "success", message: "" });

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
      primaryLeadId: "",
      isCouplesMeeting: false,
      additionalLeadId: "",
      isInPersonMeeting: false,
      address: "",
      specialization: "",
      agentId: "",
    },
  });

  const isCouplesMeeting = watch("isCouplesMeeting");
  const isInPersonMeeting = watch("isInPersonMeeting");
  const primaryLeadId = watch("primaryLeadId");
  const additionalLeadId = watch("additionalLeadId");
  const address = watch("address");
  const specialization = watch("specialization");

  // Use custom hooks for data fetching
  const { specializations, loading: loadingSpecializations } = useSpecializations();
  const { agents, loading: loadingAgents } = useAgents(specialization ?? "");

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

  // Clear selected agent when specialization changes
  useEffect(() => {
    setValue("agentId", "");
    setSelectedAgent(null);
  }, [specialization, setValue]);

  const toggleCouplesMeeting = () => {
    const newValue = !isCouplesMeeting;
    setValue("isCouplesMeeting", newValue, { shouldValidate: true });
    if (!newValue) {
      setValue("additionalLeadId", "", { shouldValidate: true });
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
      primaryLeadId,
      isCouplesMeeting,
      additionalLeadId,
      isInPersonMeeting,
      address,
    };
    
    const result = leadFormPart1Schema.safeParse(part1Data);
    
    // Trigger validation on all Part 1 fields
    await trigger(["primaryLeadId", "additionalLeadId", "address"]);
    
    return result.success;
  }, [primaryLeadId, isCouplesMeeting, additionalLeadId, isInPersonMeeting, address, trigger]);

  const handleContinue = useCallback(async () => {
    const isValid = await validatePart1();
    if (isValid) {
      setCurrentPart(2);
    }
  }, [validatePart1]);

  // Handle Enter key to continue from Part 1
  useEffect(() => {
    if (currentPart !== 1) return;
    const handler = (e: KeyboardEvent) => e.key === "Enter" && handleContinue();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentPart, handleContinue]);

  // Handle Enter key to submit from Part 2
  useEffect(() => {
    if (currentPart !== 2 || showCalendar) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && isValid && !isSubmitting) {
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentPart, showCalendar, isValid, isSubmitting]);

  const handleBack = () => {
    setCurrentPart(1);
  };

  const handleAgentChange = (agentId: string) => {
    setValue("agentId", agentId, { shouldValidate: true });
    const agent = agents.find((a) => a.id === agentId) || null;
    setSelectedAgent(agent);
  };

  const showErrorModal = (message: string) => {
    setModal({ open: true, type: "error", message });
  };

  // Get hosts for Cal.com - either selected agent or all agents with userId
  const getHosts = (data: LeadFormData): { userId: number; weight: number }[] => {
    if (data.agentId) {
      const agent = agents.find((a) => a.id === data.agentId);
      if (agent?.userId) {
        return [{ userId: agent.userId, weight: 100 }];
      }
      return [];
    }
    return agents
      .filter((a) => a.userId !== undefined && a.userId !== null)
      .map((a) => ({ userId: a.userId as number, weight: 100 }));
  };

  const createCalcomEventType = async (data: LeadFormData, hosts: { userId: number; weight: number }[]) => {
    const response = await fetch("/api/calcom/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryLeadId: data.primaryLeadId,
        additionalLeadId: data.additionalLeadId,
        agentName: selectedAgent?.name,
        hosts,
        isInPersonMeeting: data.isInPersonMeeting,
        address: data.address,
        specialization: data.specialization,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Failed to create event type:", errorData);
      throw new Error("Failed to create event type");
    }

    return response.json();
  };

  const onSubmit = async (data: LeadFormData) => {
    setIsSubmitting(true);
    
    try {
      const hosts = getHosts(data);
      
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

  const handleBookingSuccess = async () => {
    await deleteEventType(eventTypeId);
    setEventTypeId(null);
    setShowCalendar(false);
    setModal({
      open: true,
      type: "success",
      message: "פרטי הפגישה נשלחו למייל.",
    });
  };

  const handleBookingError = async () => {
    await deleteEventType(eventTypeId);
    setEventTypeId(null);
    setShowCalendar(false);
    setModal({
      open: true,
      type: "error",
      message: "אירעה שגיאה בקביעת הפגישה. אנא נסה שוב.",
    });
  };

  const handleBackToForm = async () => {
    await deleteEventType(eventTypeId);
    setEventTypeId(null);
    setBookingLink("");
    setShowCalendar(false);
  };

  return (
    <div className={cn("mx-auto w-full transition-all", showCalendar ? "max-w-5xl" : "max-w-xl")}>
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
          <Calendar className="h-5 w-5 text-primary" />
          <span className="font-medium text-primary">תיאום פגישה חדשה</span>
        </div>
        <h1 className="text-3xl font-bold text-primary">
          HiTech סוכנות לביטוח
        </h1>
        <p className="mt-2 text-gray-500">
          מלא את הפרטים ובחר סוכן לתיאום פגישה
        </p>
      </div>

      {/* Progress indicator */}
      {!showCalendar && (
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
            currentPart >= 1 ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
          )}>
            {currentPart > 1 ? <CheckCircle className="h-5 w-5" /> : "1"}
          </div>
          <div className={cn(
            "h-1 w-16 rounded-full transition-colors",
            currentPart === 2 ? "bg-primary" : "bg-gray-200"
          )} />
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
            currentPart === 2 ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
          )}>
            2
          </div>
        </div>
      )}

      {showCalendar && bookingLink ? (
        <div className="space-y-4">
          <button
            onClick={handleBackToForm}
            className="cursor-pointer text-sm text-primary hover:underline"
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
                {...register("primaryLeadId")}
                label="מספר ליד"
                error={errors.primaryLeadId?.message}
                placeholder="הזן מספר ליד"
                autoFocus
              />

              {/* Additional Lead ID (conditional) */}
              {isCouplesMeeting && (
                <TextInput
                  {...register("additionalLeadId")}
                  label="מספר ליד נוסף"
                  error={errors.additionalLeadId?.message}
                  placeholder="הזן מספר ליד נוסף"
                  className="animate-fade-in"
                />
              )}

              {/* Couples Meeting Toggle */}
              <div className="space-y-3">
                <ToggleButton
                  label="פגישה זוגית"
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
                  label="כתובת לפגישה"
                  error={errors.address?.message}
                  placeholder="הזן כתובת מלאה"
                  className="animate-fade-in"
                />
              )}

              {/* Continue Button */}
              <button
                type="button"
                onClick={handleContinue}
                className={cn(
                  "mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-4 text-lg font-semibold text-white",
                  "hover:bg-primary/90 active:scale-[0.98]"
                )}
              >
                <span>המשך</span>
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Part 2: Agent Selection & Summary */}
          {currentPart === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="mb-4 border-b border-gray-100 pb-3">
                <h2 className="text-xl font-semibold text-primary">בחירת סוכן</h2>
                <p className="text-base text-gray-500">בחר התמחות וסוכן לתיאום הפגישה</p>
              </div>

              {/* Summary of Part 1 */}
              <div className="rounded-xl bg-gray-50 p-4">
                <h3 className="mb-3 text-base font-medium text-gray-700">סיכום פרטי הליד</h3>
                <div className="border-t border-gray-300 mb-3" />
                <div className="space-y-1">
                  <SummaryItem label="מספר ליד" value={primaryLeadId} />
                  {isCouplesMeeting && additionalLeadId && (
                    <SummaryItem label="מספר ליד נוסף" value={additionalLeadId} />
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

              {/* Specialization */}
              <SearchableSelect
                label="התמחות"
                options={specializations.map((s) => ({ value: s.name, label: s.name }))}
                value={specialization || ""}
                onChange={(value) => setValue("specialization", value, { shouldValidate: true })}
                placeholder="בחר התמחות"
                loadingPlaceholder="טוען..."
                emptyPlaceholder="אין התמחויות"
                noResultsText="לא נמצאו תוצאות"
                disabled={loadingSpecializations}
                loading={loadingSpecializations}
                error={errors.specialization?.message}
              />

              {/* Agent */}
              <SearchableSelect
                label="סוכן"
                options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                value={watch("agentId") || ""}
                onChange={handleAgentChange}
                placeholder="בחר סוכן ספציפי"
                loadingPlaceholder="טוען סוכנים..."
                emptyPlaceholder="לא נמצאו סוכנים"
                noResultsText="לא נמצאו תוצאות"
                disabled={loadingAgents}
                loading={loadingAgents}
                error={errors.agentId?.message}
              />

              {/* Navigation Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-border bg-white py-4 font-semibold text-gray-600",
                    "hover:border-primary hover:text-primary active:scale-[0.98]"
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
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Calendar className="h-5 w-5" />
                  )}
                  <span>{isSubmitting ? "טוען..." : "קביעת פגישה"}</span>
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      <Dialog open={modal.open} onOpenChange={(open) => setModal({ ...modal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle
              className={cn(
                "text-2xl",
                modal.type === "success" && "text-primary",
                modal.type === "error" && "text-red-600"
              )}
            >
              {modal.type === "success" ? "הפגישה נקבעה בהצלחה" : "שגיאה"}
            </DialogTitle>
            <DialogDescription className="text-base">{modal.message}</DialogDescription>
          </DialogHeader>
          {modal.type === "success" && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-xl bg-primary py-3 font-semibold text-white transition-all hover:bg-primary/90"
            >
              תיאום פגישה נוספת
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
