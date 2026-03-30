import { LucideIcon } from "lucide-react";
import { Card } from "../ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
}

export function StatCard({ title, value, icon: Icon, change, changeType = "neutral" }: StatCardProps) {
  const changeColors = {
    positive: "text-[#22C55E]",
    negative: "text-[#EF4444]",
    neutral: "text-[#9CA3AF]",
  };

  return (
    <Card className="bg-[#111827] border-[#1F2937] p-4 transition-colors hover:border-[#4F8CFF]/30 sm:p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] text-[#9CA3AF] mb-1">{title}</p>
          <p className="mb-1 text-[24px] font-semibold leading-none text-white sm:text-[26px] lg:text-[28px]">{value}</p>
          {change && (
            <p className={`text-[11px] leading-5 sm:text-[12px] ${changeColors[changeType]}`}>
              {change}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F8CFF]/10 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
          <Icon className="h-5 w-5 text-[#4F8CFF] sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
        </div>
      </div>
    </Card>
  );
}
