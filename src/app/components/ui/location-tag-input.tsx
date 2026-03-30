import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { searchUsLocations, type LocationSuggestion } from "../../utils/us-location-search";

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export interface LocationTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export function LocationTagInput({
  tags,
  onChange,
  placeholder = "Type a US city or state…",
  maxTags = 50,
  className = "",
}: LocationTagInputProps) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedInput = useDebouncedValue(input, 300);

  useEffect(() => {
    if (!isFocused || !debouncedInput.trim()) {
      abortRef.current?.abort();
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveIndex(-1);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    searchUsLocations(debouncedInput, controller.signal)
      .then((results) => {
        const filtered = results.filter(
          (item) => !tags.some((tag) => tag.toLowerCase() === item.value.toLowerCase())
        );
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setActiveIndex(-1);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedInput, isFocused, tags]);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || tags.some((item) => item.toLowerCase() === tag.toLowerCase()) || tags.length >= maxTags) return;
    onChange([...tags, tag]);
    setInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, -1));
        return;
      }
      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        addTag(suggestions[activeIndex].value);
        return;
      }
      if (event.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    if ((event.key === "Enter" || event.key === ",") && input.trim()) {
      event.preventDefault();
      addTag(input);
    } else if (event.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className="flex min-h-[44px] cursor-text flex-wrap gap-1.5 rounded-lg border border-[#1F2937] bg-[#0B0F14] px-2.5 py-2 transition-colors focus-within:border-[#4F8CFF]/50"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#4F8CFF]/25 bg-[#4F8CFF]/15 py-0.5 pl-2.5 pr-1.5 text-[12px] font-medium text-[#4F8CFF]"
          >
            {tag}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeTag(index);
              }}
              className="transition-colors hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setShowSuggestions(Boolean(event.target.value.trim()));
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setIsFocused(true);
            if (suggestions.length > 0 && input.trim()) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            window.setTimeout(() => setShowSuggestions(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[160px] flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#4B5563]"
        />

        {isLoading && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin self-center text-[#9CA3AF]" />
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#1F2937] bg-[#111827] shadow-2xl">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.key}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(suggestion.value);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors ${
                index === activeIndex
                  ? "bg-[#4F8CFF]/10 text-white"
                  : "text-[#D1D5DB] hover:bg-[#1F2937]"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#4F8CFF]" />
              <span>{suggestion.displayName}</span>
            </button>
          ))}
          <div className="flex items-center gap-1 border-t border-[#1F2937] px-3 py-1.5">
            <span className="text-[10px] text-[#6B7280]">US-only suggestions via OpenStreetMap</span>
          </div>
        </div>
      )}
    </div>
  );
}
