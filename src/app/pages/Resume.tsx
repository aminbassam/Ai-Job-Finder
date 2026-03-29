import { useState } from "react";
import { Database, FileUp, Settings2, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ResumePreferencesTab } from "./settings/ResumePreferencesTab";
import { ProfilesWorkspace } from "./master-resume/ProfilesWorkspace";
import { ImportWorkspace } from "./master-resume/ImportWorkspace";

type ResumeTab = "profiles" | "import" | "preferences";

export function Resume() {
  const [activeTab, setActiveTab] = useState<ResumeTab>("profiles");
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [focusProfileId, setFocusProfileId] = useState<string | null>(null);

  function openCreatedProfile(profileId: string) {
    setFocusProfileId(profileId);
    setProfileRefreshKey((current) => current + 1);
    setActiveTab("profiles");
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="mb-2 text-[32px] font-semibold text-white">Master Resume</h1>
          <p className="max-w-4xl text-[14px] text-[#9CA3AF]">
            Build structured career intelligence, maintain multiple reusable profiles, import from LinkedIn or existing resumes, and keep one default Master Resume profile powering job scoping, AI scoring, and tailored resume generation across the platform.
          </p>
        </div>
        <Card className="border-[#1F2937] bg-[#111827] px-4 py-3">
          <p className="text-[12px] text-[#9CA3AF]">
            Shared AI behavior, formatting, safety rules, and default prompt instructions live in{" "}
            <Link to="/settings" className="text-[#4F8CFF] hover:underline">
              Settings → AI Settings
            </Link>
            .
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {[
          {
            icon: Database,
            title: "Structured Data Layer",
            body: "Profiles store experiences, bullets, skills, projects, and leadership as reusable structured data instead of one static document.",
          },
          {
            icon: FileUp,
            title: "Import + Normalize",
            body: "Bring in LinkedIn or resume files, parse them into JSON, then turn the results into usable Master Resume profiles.",
          },
          {
            icon: Sparkles,
            title: "Tailor + Score",
            body: "Use the default profile as the source of truth for AI job scoring, qualification matching, and tailored resume generation.",
          },
        ].map((item) => (
          <Card key={item.title} className="border-[#1F2937] bg-[#111827] p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F8CFF]/10">
              <item.icon className="h-5 w-5 text-[#4F8CFF]" />
            </div>
            <h2 className="text-[16px] font-semibold text-white">{item.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#9CA3AF]">{item.body}</p>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ResumeTab)} className="space-y-6">
        <TabsList className="h-auto w-full justify-start border border-[#1F2937] bg-[#111827] p-1">
          <TabsTrigger value="profiles" className="gap-2 px-4 py-2 text-[13px] data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <Database className="h-4 w-4" />
            Profiles
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2 px-4 py-2 text-[13px] data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <FileUp className="h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2 px-4 py-2 text-[13px] data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <Settings2 className="h-4 w-4" />
            Legacy Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          <ProfilesWorkspace refreshKey={profileRefreshKey} focusProfileId={focusProfileId} />
        </TabsContent>

        <TabsContent value="import">
          <ImportWorkspace onProfileCreated={openCreatedProfile} />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          <Card className="border-[#1F2937] bg-[#111827] p-4">
            <p className="text-[13px] text-[#9CA3AF]">
              These preferences remain available for compatibility with the older resume flow. The new structured profiles above should now be your primary source of truth.
            </p>
          </Card>
          <ResumePreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
