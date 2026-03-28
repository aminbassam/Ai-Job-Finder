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
    <Card className="bg-[#111827] border-[#1F2937] p-6 hover:border-[#4F8CFF]/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[13px] text-[#9CA3AF] mb-1">{title}</p>
          <p className="text-[28px] font-semibold text-white mb-1">{value}</p>
          {change && (
            <p className={`text-[12px] ${changeColors[changeType]}`}>
              {change}
            </p>
          )}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F8CFF]/10">
          <Icon className="h-6 w-6 text-[#4F8CFF]" />
        </div>
      </div>
    </Card>
  );
}
