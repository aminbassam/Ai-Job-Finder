import { useState, useEffect } from "react";
import { User, FileText, Sparkles, Bell, CreditCard } from "lucide-react";
import { ResumePreferencesTab } from "./settings/ResumePreferencesTab";
import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { LocationInput } from "../components/ui/location-input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../contexts/AuthContext";
import { profileService, type ProfileData } from "../services/profile.service";

export function Settings() {
  const { user, updateUser } = useAuth();

  // ── Profile tab state ────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  useEffect(() => {
    profileService
      .getProfile()
      .then((data) => {
        setProfile(data);
        setFirstName(data.firstName ?? "");
        setLastName(data.lastName ?? "");
        setEmail(data.email ?? "");
        setLocation(data.location ?? "");
        setCurrentTitle(data.currentTitle ?? "");
        setLinkedinUrl(data.linkedinUrl ?? "");
      })
      .catch((err: Error) => {
        // Fall back to auth context values so the form is never blank
        setFirstName(user?.firstName ?? "");
        setLastName(user?.lastName ?? "");
        setEmail(user?.email ?? "");
        setLocation(user?.location ?? "");
        setProfileError(err.message);
      })
      .finally(() => setProfileLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleProfileSave() {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      await profileService.updateProfile({
        firstName,
        lastName,
        location,
        currentTitle,
        linkedinUrl,
      });
      // Sync name/location back to auth context so sidebar reflects changes instantly
      updateUser({ firstName, lastName, location });
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold text-white mb-2">Settings</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Manage your account and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-[#111827] border border-[#1F2937] p-1">
          <TabsTrigger value="profile" className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="resume" className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <FileText className="h-4 w-4 mr-2" />
            Resume
          </TabsTrigger>
          <TabsTrigger value="ai" className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <Sparkles className="h-4 w-4 mr-2" />
            AI Providers
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:bg-[#4F8CFF] data-[state=active]:text-white">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h2 className="text-[20px] font-semibold text-white mb-6">Profile Information</h2>

            {profileLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-[#9CA3AF]">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-[#4F8CFF] border-t-transparent rounded-full" />
                Loading profile…
              </div>
            ) : (
              <div className="space-y-5 max-w-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[13px] text-[#9CA3AF] mb-2 block">First Name</Label>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="bg-[#0B0F14] border-[#1F2937] text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px] text-[#9CA3AF] mb-2 block">Last Name</Label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="bg-[#0B0F14] border-[#1F2937] text-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[13px] text-[#9CA3AF] mb-2 block">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    disabled
                    className="bg-[#0B0F14] border-[#1F2937] text-[#9CA3AF] cursor-not-allowed"
                    title="Email cannot be changed here"
                  />
                  <p className="text-[11px] text-[#4B5563] mt-1">Contact support to change your email.</p>
                </div>

                <div>
                  <Label className="text-[13px] text-[#9CA3AF] mb-2 block">Location</Label>
                  <LocationInput
                    value={location}
                    onChange={setLocation}
                    placeholder="e.g. San Francisco, CA"
                  />
                </div>

                <div>
                  <Label className="text-[13px] text-[#9CA3AF] mb-2 block">Job Title</Label>
                  <Input
                    value={currentTitle}
                    onChange={(e) => setCurrentTitle(e.target.value)}
                    placeholder="e.g. Senior Product Manager"
                    className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
                  />
                </div>

                <div>
                  <Label className="text-[13px] text-[#9CA3AF] mb-2 block">LinkedIn Profile</Label>
                  <Input
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                    className="bg-[#0B0F14] border-[#1F2937] text-white placeholder:text-[#4B5563]"
                  />
                </div>

                {profileError && (
                  <p className="text-[13px] text-[#EF4444]">{profileError}</p>
                )}
                {profileSuccess && (
                  <p className="text-[13px] text-[#22C55E]">Profile saved successfully.</p>
                )}

                <Button
                  className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white"
                  onClick={handleProfileSave}
                  disabled={profileSaving}
                >
                  {profileSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            )}
          </Card>

          {/* Account info card */}
          {!profileLoading && profile && (
            <Card className="bg-[#111827] border-[#1F2937] p-6 mt-4 max-w-2xl">
              <h2 className="text-[16px] font-semibold text-white mb-4">Account Details</h2>
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <p className="text-[#9CA3AF] mb-1">Plan</p>
                  <span className="capitalize text-white font-medium">
                    {user?.plan ?? "free"}
                  </span>
                </div>
                <div>
                  <p className="text-[#9CA3AF] mb-1">AI Credits</p>
                  <span className="text-white font-medium">
                    {user?.aiCredits ?? 0} / {user?.totalCredits ?? 0}
                  </span>
                </div>
                <div>
                  <p className="text-[#9CA3AF] mb-1">Email Verified</p>
                  {user?.emailVerified ? (
                    <Badge className="bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30 text-[11px]">Verified</Badge>
                  ) : (
                    <Badge variant="outline" className="border-[#F59E0B]/30 text-[#F59E0B] text-[11px]">Unverified</Badge>
                  )}
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Resume Preferences Tab */}
        <TabsContent value="resume">
          <ResumePreferencesTab />
        </TabsContent>

        {/* AI Providers Tab */}
        <TabsContent value="ai">
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h2 className="text-[20px] font-semibold text-white mb-6">AI Provider Settings</h2>
            <div className="space-y-6 max-w-2xl">
              <div className="p-5 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-[16px] font-semibold text-white mb-1">OpenAI (ChatGPT)</h3>
                    <p className="text-[12px] text-[#9CA3AF]">Use GPT-4 for resume generation and job analysis</p>
                  </div>
                  <Badge className="bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30">
                    Connected
                  </Badge>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[13px] text-[#9CA3AF] mb-2 block">API Key</Label>
                    <Input
                      type="password"
                      defaultValue="sk-••••••••••••••••"
                      className="bg-[#111827] border-[#1F2937] text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]">
                      Update Key
                    </Button>
                    <Button variant="outline" size="sm" className="text-[#EF4444] hover:text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10">
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-[16px] font-semibold text-white mb-1">Anthropic (Claude)</h3>
                    <p className="text-[12px] text-[#9CA3AF]">Use Claude for detailed job matching</p>
                  </div>
                  <Badge variant="outline" className="border-[#374151] text-[#9CA3AF]">
                    Not Connected
                  </Badge>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[13px] text-[#9CA3AF] mb-2 block">API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-ant-..."
                      className="bg-[#111827] border-[#1F2937] text-white placeholder:text-[#9CA3AF]"
                    />
                  </div>
                  <Button className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white">
                    Connect Claude
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#4F8CFF]/5 border border-[#4F8CFF]/20">
                <p className="text-[13px] text-[#9CA3AF]">
                  <span className="font-semibold text-[#4F8CFF]">Default Provider:</span> OpenAI (GPT-4)
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h2 className="text-[20px] font-semibold text-white mb-6">Notification Preferences</h2>
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <div>
                  <p className="text-[14px] font-medium text-white mb-1">New job matches</p>
                  <p className="text-[12px] text-[#9CA3AF]">Get notified when new high-match jobs are found</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <div>
                  <p className="text-[14px] font-medium text-white mb-1">Application updates</p>
                  <p className="text-[12px] text-[#9CA3AF]">Status changes on your applications</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <div>
                  <p className="text-[14px] font-medium text-white mb-1">Weekly summary</p>
                  <p className="text-[12px] text-[#9CA3AF]">Receive a weekly report of your job search activity</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937]">
                <div>
                  <p className="text-[14px] font-medium text-white mb-1">AI insights</p>
                  <p className="text-[12px] text-[#9CA3AF]">Tips and recommendations from AI analysis</p>
                </div>
                <Switch />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing">
          <Card className="bg-[#111827] border-[#1F2937] p-6">
            <h2 className="text-[20px] font-semibold text-white mb-6">Billing & Subscription</h2>
            <div className="space-y-6 max-w-2xl">
              <div className="p-6 rounded-lg bg-gradient-to-r from-[#4F8CFF]/10 to-[#8B5CF6]/10 border border-[#4F8CFF]/30">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-[18px] font-semibold text-white mb-1 capitalize">
                      {user?.plan === "pro" ? "Pro Plan" : user?.plan === "agency" ? "Agency Plan" : "Free Plan"}
                    </h3>
                    <p className="text-[13px] text-[#9CA3AF]">
                      {user?.plan === "free" ? "No billing — upgrade to unlock more." : "Active subscription"}
                    </p>
                  </div>
                  <Badge className="bg-[#4F8CFF] text-white">Active</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[12px] text-[#9CA3AF] mb-1">AI Credits</p>
                    <p className="text-[16px] font-semibold text-white">
                      {user?.aiCredits ?? 0} / {user?.totalCredits ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] text-[#9CA3AF] mb-1">Resume Generations</p>
                    <p className="text-[16px] font-semibold text-white">Unlimited</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[16px] font-semibold text-white mb-3">Payment Method</h3>
                <div className="p-4 rounded-lg bg-[#0B0F14] border border-[#1F2937] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 rounded bg-[#1F2937] flex items-center justify-center">
                      <span className="text-[10px] text-white">VISA</span>
                    </div>
                    <div>
                      <p className="text-[13px] text-white">•••• •••• •••• 4242</p>
                      <p className="text-[11px] text-[#9CA3AF]">Expires 12/2027</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]">
                    Update
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="bg-[#1F2937] hover:bg-[#374151] text-white border-[#374151]">
                  Manage Subscription
                </Button>
                <Button variant="outline" className="text-[#EF4444] hover:text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10">
                  Cancel Plan
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
