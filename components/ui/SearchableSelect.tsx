"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  loadingPlaceholder?: string;
  emptyPlaceholder?: string;
  noResultsText?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  label,
  placeholder = "בחר...",
  loadingPlaceholder = "טוען...",
  emptyPlaceholder = "אין אפשרויות",
  noResultsText = "לא נמצאו תוצאות",
  disabled = false,
  loading = false,
  error,
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || "";

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [debouncedSearch]);

  // Focus management - only focus trigger when closing, not on mount
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionsRef.current) {
      const option = optionsRef.current.children[highlightedIndex] as HTMLElement;
      option?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = useCallback(() => {
    if (disabled || loading) return;
    setIsOpen(true);
    setSearchText("");
    setDebouncedSearch("");
    setHighlightedIndex(-1);
  }, [disabled, loading]);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchText("");
    setDebouncedSearch("");
  }, [onChange]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        setIsOpen(false);
        setSearchText("");
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].value);
        } else if (filteredOptions.length === 1) {
          handleSelect(filteredOptions[0].value);
        }
        break;
    }
  };

  const baseInputClass = cn(
    "w-full rounded-xl border-2 border-border bg-white px-4 py-3",
    "hover:border-accent focus:border-accent focus:ring-0 focus:outline-none",
    "placeholder:text-gray-400 cursor-pointer transition-colors group",
    !!error && "border-error",
    disabled && "cursor-not-allowed bg-gray-50 opacity-60 hover:border-border",
    loading && "cursor-not-allowed hover:border-border"
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="block text-base font-medium text-gray-700">{label}</label>
      )}
      <div ref={containerRef} className={cn("relative", disabled && "opacity-60")}>
        {/* Closed state */}
        {!isOpen && (
          <div
            ref={triggerRef}
            onClick={handleOpen}
            onKeyDown={handleTriggerKeyDown}
            tabIndex={disabled || loading ? -1 : 0}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            className={cn(baseInputClass, "flex items-center justify-between")}
          >
            <span className={cn(!displayValue && "text-gray-400")}>
              {loading
                ? loadingPlaceholder
                : options.length === 0 && !loading
                  ? emptyPlaceholder
                  : displayValue || placeholder}
            </span>
            <div className="flex items-center gap-2">
              {loading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              <ChevronDown className="h-5 w-5 text-gray-400 transition-colors group-hover:text-accent group-focus:text-accent" />
            </div>
          </div>
        )}

        {/* Open state */}
        {isOpen && (
          <>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="הקלד לחיפוש..."
                className={cn(baseInputClass, "pl-10")}
              />
              <ChevronDown className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 rotate-180 text-accent" />
            </div>

            <div
              ref={optionsRef}
              role="listbox"
              className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border-2 border-accent bg-white shadow-lg"
            >
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-center text-gray-500">{noResultsText}</div>
              ) : (
                filteredOptions.map((option, index) => (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "cursor-pointer px-4 py-3 duration-75",
                      index === highlightedIndex && "bg-primary/10",
                      option.value === value && "font-medium text-primary"
                    )}
                  >
                    {option.label}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
