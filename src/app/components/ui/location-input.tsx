import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "./input";
import { searchUsLocations, type LocationSuggestion } from "../../utils/us-location-search";

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface LocationInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
}

export function LocationInput({
  value = "",
  onChange,
  placeholder = "e.g. San Francisco, CA",
  className = "",
  name,
}: LocationInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebouncedValue(query, 350);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!isFocused || debouncedQuery.trim().length < 1) {
      abortRef.current?.abort();
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setIsLoading(true);

    searchUsLocations(debouncedQuery, controller.signal)
      .then((results) => {
        setSuggestions(results);
        setIsOpen(isFocused && results.length > 0);
        setActiveIndex(-1);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, isFocused]);

  function handleSelect(suggestion: Suggestion) {
    setQuery(suggestion.displayName);
    onChange?.(suggestion.displayName);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    onChange?.(val);
  }

  function handleClear() {
    setQuery("");
    onChange?.("");
    setSuggestions([]);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4F8CFF] pointer-events-none" />
        <Input
          name={name}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            window.setTimeout(() => setIsOpen(false), 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`pl-9 pr-8 bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#9CA3AF] ${className}`}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] animate-spin" />
        )}
        {!isLoading && query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#111827] border border-[#1F2937] rounded-lg shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={[
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors",
                i === activeIndex
                  ? "bg-[#4F8CFF]/10 text-white"
                  : "text-[#D1D5DB] hover:bg-[#1F2937]",
              ].join(" ")}
            >
              <MapPin className="h-3.5 w-3.5 text-[#4F8CFF] shrink-0" />
              <span>{s.displayName}</span>
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-[#1F2937] flex items-center gap-1">
            <span className="text-[10px] text-[#6B7280]">US-only suggestions via OpenStreetMap</span>
          </div>
        </div>
      )}
    </div>
  );
}
