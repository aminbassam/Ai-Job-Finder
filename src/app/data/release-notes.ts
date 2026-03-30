export interface ReleaseNoteEntry {
  version: string;
  timestamp: string;
  summary: string;
  details: string[];
}

export const releaseNotes: ReleaseNoteEntry[] = [
  {
    version: "v0.9.7",
    timestamp: "March 30, 2026 · 10:20 PM",
    summary: "Dashboard and analytics now reflect real platform data instead of placeholder content.",
    details: [
      "Added live recent jobs to the dashboard and tied recent resumes to generated tailored resumes.",
      "Connected dashboard and analytics cards, trends, score distribution, source performance, and funnel metrics to the real backend analytics endpoints.",
      "Improved resume profile icon actions with clearer mouse-hover labels.",
    ],
  },
  {
    version: "v0.9.6",
    timestamp: "March 30, 2026 · 8:55 PM",
    summary: "Master Resume got a larger workflow upgrade focused on better matching and cleaner editing.",
    details: [
      "Added multi-file resume import with AI-suggested profile names and separate create flow for new profiles.",
      "Matched jobs now stay visible inside each resume profile and use the same best-match data as the Job Board.",
      "Added card and table views, readiness visuals, and richer best-match details in the resume workspace.",
    ],
  },
  {
    version: "v0.9.5",
    timestamp: "March 30, 2026 · 7:10 PM",
    summary: "Chrome extension workflow was expanded to make imported jobs easier to review.",
    details: [
      "Extension popup now shows recently imported jobs, match score status, and related resume profiles for each saved job.",
      "Backend support was added for fetching recent extension imports and recommending matching resume profiles.",
      "Extension UX now includes clearer details and guidance for users working from job pages.",
    ],
  },
  {
    version: "v0.9.4",
    timestamp: "March 30, 2026 · 5:45 PM",
    summary: "Account management and production access were improved.",
    details: [
      "Users can now sign in with either email or username and change their password in settings.",
      "Super admins can reset user passwords from admin user management.",
      "Public health endpoint support was aligned so live monitoring can use `/api/health`.",
    ],
  },
  {
    version: "v0.9.3",
    timestamp: "March 29, 2026 · 11:30 PM",
    summary: "Client onboarding and demo access were improved for live reviews.",
    details: [
      "Added a seeded demo user, demo login details on the sign-in page, and demo cleanup messaging.",
      "Added extension ZIP download support from settings.",
      "Improved API key instructions and surfaced setup guidance in the product.",
    ],
  },
  {
    version: "v0.9.2",
    timestamp: "March 29, 2026 · 8:50 PM",
    summary: "Production deployment and stability were hardened for Hostinger VPS.",
    details: [
      "Fixed backend environment loading, schema bootstrap, and startup migration behavior for fresh production databases.",
      "Resolved live-site issues around Nginx serving, database bootstrapping, SMTP setup, and seeded admin access.",
      "Brought the app live on `jobfinder.aminbassam.com` with working authentication and email delivery.",
    ],
  },
];
