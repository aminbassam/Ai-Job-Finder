interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return { bg: "bg-[#22C55E]/10", text: "text-[#22C55E]", border: "border-[#22C55E]/30" };
    if (score >= 60) return { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]", border: "border-[#F59E0B]/30" };
    return { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", border: "border-[#EF4444]/30" };
  };

  const sizes = {
    sm: "text-[11px] px-2 py-0.5",
    md: "text-[13px] px-3 py-1",
    lg: "text-[16px] px-4 py-1.5",
  };

  const colors = getScoreColor(score);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg font-semibold border ${colors.bg} ${colors.text} ${colors.border} ${sizes[size]}`}
    >
      {score}%
    </div>
  );
}
