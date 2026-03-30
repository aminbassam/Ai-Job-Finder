import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, X } from "lucide-react";
import { Input } from "./input";
import { searchJobTitles } from "../../data/job-titles";

export interface JobTitleInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
}

export function JobTitleInput({
  value = "",
  onChange,
  placeholder = "e.g. Senior Product Manager",
  className = "",
  name,
}: JobTitleInputProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const suggestions = useMemo(() => searchJobTitles(query, 8), [query]);

  function handleSelect(nextValue: string) {
    setQuery(nextValue);
    onChange?.(nextValue);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleClear() {
    setQuery("");
    onChange?.("");
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F8CFF]" />
        <Input
          name={name}
          value={query}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            onChange?.(nextValue);
            setIsOpen(Boolean(nextValue.trim()));
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(Boolean(suggestions.length))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`bg-[#0B0F14] border-[#1F2937] pl-9 pr-8 text-white placeholder:text-[#9CA3AF] ${className}`}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#1F2937] bg-[#111827] shadow-2xl">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full px-3 py-2 text-left text-[13px] transition-colors ${
                index === activeIndex
                  ? "bg-[#4F8CFF]/10 text-white"
                  : "text-[#D1D5DB] hover:bg-[#1F2937]"
              }`}
            >
              {suggestion}
            </button>
          ))}
          <div className="border-t border-[#1F2937] px-3 py-1.5">
            <span className="text-[10px] text-[#6B7280]">Shared job title catalog</span>
          </div>
        </div>
      )}
    </div>
  );
}
