import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Briefcase, X } from "lucide-react";
import { searchJobTitles } from "../../data/job-titles";

export interface JobTitleTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export function JobTitleTagInput({
  tags,
  onChange,
  placeholder = "Type a job title…",
  maxTags = 50,
  className = "",
}: JobTitleTagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () =>
      searchJobTitles(input, 8).filter(
        (title) => !tags.some((tag) => tag.toLowerCase() === title.toLowerCase())
      ),
    [input, tags]
  );

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || tags.some((item) => item.toLowerCase() === tag.toLowerCase()) || tags.length >= maxTags) return;
    onChange([...tags, tag]);
    setInput("");
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
        addTag(suggestions[activeIndex]);
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
            setShowSuggestions(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[160px] flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#4B5563]"
        />
        <Briefcase className="self-center text-[#4F8CFF] h-4 w-4" />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#1F2937] bg-[#111827] shadow-2xl">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(suggestion);
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
