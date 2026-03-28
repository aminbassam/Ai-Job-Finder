import { ResumePreferencesTab } from "./settings/ResumePreferencesTab";

export function Resume() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[32px] font-semibold text-white mb-2">Resume</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Configure your AI resume engine — target roles, tone, skills, and safety rules
        </p>
      </div>

      <ResumePreferencesTab />
    </div>
  );
}
