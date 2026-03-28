import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "./input";

interface Suggestion {
  displayName: string;
  key: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
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

  // Fetch suggestions from Nominatim (OpenStreetMap) — free, no API key
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);

    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(debouncedQuery)}&format=json&limit=7&addressdetails=1`,
      {
        headers: { "Accept-Language": "en" },
        signal: abortRef.current.signal,
      }
    )
      .then((r) => r.json())
      .then((data: NominatimResult[]) => {
        const seen = new Set<string>();
        const results: Suggestion[] = [];

        for (const item of data) {
          const { city, town, village, county, state, country } = item.address;
          const parts = [city ?? town ?? village ?? county, state, country].filter(Boolean);
          const displayName = parts.join(", ");

          if (displayName && !seen.has(displayName)) {
            seen.add(displayName);
            results.push({ displayName, key: `${item.lat}-${item.lon}` });
          }
        }

        setSuggestions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setSuggestions([]);
      })
      .finally(() => setIsLoading(false));
  }, [debouncedQuery]);

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
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
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
            <span className="text-[10px] text-[#6B7280]">Powered by OpenStreetMap</span>
          </div>
        </div>
      )}
    </div>
  );
}
