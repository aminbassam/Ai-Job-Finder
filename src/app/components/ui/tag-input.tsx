import { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";

export interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  maxTags?: number;
  className?: string;
}

export function TagInput({
  tags,
  onChange,
  placeholder = "Type and press Enter…",
  suggestions = [],
  maxTags = 50,
  className = "",
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || tags.includes(tag) || tags.length >= maxTags) return;
    onChange([...tags, tag]);
    setInput("");
    setShowSuggestions(false);
    setActiveIndex(-1);
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        addTag(filtered[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  const filtered = suggestions
    .filter(
      (s) =>
        s.toLowerCase().includes(input.toLowerCase()) &&
        !tags.includes(s)
    )
    .slice(0, 7);

  return (
    <div className={`relative ${className}`}>
      <div
        className="flex flex-wrap gap-1.5 min-h-[44px] px-2.5 py-2 bg-[#0B0F14] border border-[#1F2937] rounded-lg cursor-text focus-within:border-[#4F8CFF]/50 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-md bg-[#4F8CFF]/15 text-[#4F8CFF] text-[12px] font-medium border border-[#4F8CFF]/25 shrink-0"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="hover:text-white transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => input && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-white text-[13px] outline-none placeholder:text-[#4B5563]"
        />
      </div>

      {showSuggestions && input && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#111827] border border-[#1F2937] rounded-lg shadow-2xl overflow-hidden">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                i === activeIndex
                  ? "bg-[#4F8CFF]/10 text-white"
                  : "text-[#D1D5DB] hover:bg-[#1F2937]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
