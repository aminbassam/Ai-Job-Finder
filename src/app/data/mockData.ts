export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  salary?: string;
  score: number;
  status: "new" | "ready" | "applied" | "interview" | "rejected";
  source: "LinkedIn" | "Indeed" | "Company" | "AngelList";
  description: string;
  requirements: string[];
  tags: string[];
  postedDate: string;
  aiAnalysis?: {
    strengths: string[];
    gaps: string[];
    recommendation: string;
  };
}

export interface Resume {
  id: string;
  name: string;
  type: "master" | "tailored";
  tags: string[];
  linkedJobId?: string;
  lastModified: string;
  downloadUrl?: string;
}

export interface Application {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  status: "new" | "ready" | "applied" | "interview" | "rejected";
  score: number;
  resumeId: string;
  appliedDate?: string;
  source: string;
}

export interface ActivityEvent {
  id: string;
  type: "job_found" | "resume_generated" | "application_sent" | "match_found";
  title: string;
  description: string;
  timestamp: string;
  icon?: string;
}

export const mockJobs: Job[] = [
  {
    id: "1",
    title: "Senior Product Manager",
    company: "Stripe",
    location: "San Francisco, CA (Remote)",
    type: "Full-time",
    salary: "$180k - $240k",
    score: 92,
    status: "ready",
    source: "LinkedIn",
    description: "We're looking for an experienced Product Manager to lead our payments infrastructure team. You'll work on building tools that power millions of businesses globally.",
    requirements: [
      "5+ years of product management experience",
      "Experience with B2B SaaS products",
      "Strong technical background",
      "Excellent communication skills",
    ],
    tags: ["Remote", "Senior", "Visa Sponsor"],
    postedDate: "2026-03-25",
    aiAnalysis: {
      strengths: [
        "Strong match with your 6 years of PM experience",
        "Your fintech background aligns perfectly",
        "Experience with API products is a key match",
      ],
      gaps: [
        "Could emphasize more enterprise sales experience",
        "Add specific metrics from payment platform work",
      ],
      recommendation: "Highly recommended - This role is an excellent fit for your background.",
    },
  },
  {
    id: "2",
    title: "Scrum Master / Agile Coach",
    company: "Notion",
    location: "New York, NY",
    type: "Full-time",
    salary: "$130k - $170k",
    score: 85,
    status: "new",
    source: "Indeed",
    description: "Join our growing product team as a Scrum Master. You'll facilitate agile ceremonies and coach teams on best practices.",
    requirements: [
      "CSM or equivalent certification",
      "3+ years as Scrum Master",
      "Experience with distributed teams",
      "Strong facilitation skills",
    ],
    tags: ["Hybrid", "Mid-level"],
    postedDate: "2026-03-26",
    aiAnalysis: {
      strengths: [
        "CSM certified - perfect match",
        "Your remote team experience is valuable",
      ],
      gaps: [
        "Highlight more coaching experience",
        "Add examples of process improvements",
      ],
      recommendation: "Good match - Consider applying with tailored resume.",
    },
  },
  {
    id: "3",
    title: "Technical Product Manager",
    company: "Vercel",
    location: "Remote (US)",
    type: "Full-time",
    salary: "$160k - $210k",
    score: 88,
    status: "ready",
    source: "Company",
    description: "Lead the development of our edge infrastructure platform. Work closely with engineering to build the future of web deployment.",
    requirements: [
      "Strong technical background (CS degree or equivalent)",
      "4+ years PM experience",
      "Experience with developer tools",
      "Understanding of cloud infrastructure",
    ],
    tags: ["Remote", "Technical", "Visa Sponsor"],
    postedDate: "2026-03-24",
  },
  {
    id: "4",
    title: "Senior SEO Manager",
    company: "Shopify",
    location: "Toronto, Canada",
    type: "Full-time",
    salary: "$120k - $160k",
    score: 72,
    status: "new",
    source: "LinkedIn",
    description: "Drive organic growth through SEO strategy and execution. Work with content, product, and engineering teams.",
    requirements: [
      "5+ years SEO experience",
      "Experience with technical SEO",
      "Data-driven approach",
      "E-commerce experience preferred",
    ],
    tags: ["On-site", "Senior"],
    postedDate: "2026-03-27",
  },
  {
    id: "5",
    title: "Product Manager, AI/ML",
    company: "OpenAI",
    location: "San Francisco, CA",
    type: "Full-time",
    salary: "$200k - $280k",
    score: 78,
    status: "new",
    source: "AngelList",
    description: "Shape the future of AI products. Work on cutting-edge language models and AI applications.",
    requirements: [
      "3+ years PM experience",
      "Understanding of ML/AI concepts",
      "Experience launching 0-1 products",
      "Technical background required",
    ],
    tags: ["On-site", "AI/ML", "High Growth"],
    postedDate: "2026-03-23",
  },
  {
    id: "6",
    title: "WordPress Developer",
    company: "Automattic",
    location: "Remote (Global)",
    type: "Full-time",
    salary: "$90k - $140k",
    score: 65,
    status: "new",
    source: "Company",
    description: "Build themes and plugins for WordPress.com. Work with a distributed team of passionate developers.",
    requirements: [
      "Strong PHP and WordPress experience",
      "Experience with React",
      "Open source contributions",
      "Self-motivated and remote-friendly",
    ],
    tags: ["Remote", "Global", "Open Source"],
    postedDate: "2026-03-28",
  },
  {
    id: "7",
    title: "Director of Product",
    company: "Linear",
    location: "Remote (US/EU)",
    type: "Full-time",
    salary: "$220k - $300k",
    score: 81,
    status: "applied",
    source: "LinkedIn",
    description: "Lead our product organization and define the future of issue tracking and project management.",
    requirements: [
      "8+ years PM experience",
      "3+ years in leadership",
      "B2B SaaS experience",
      "Strong design sensibility",
    ],
    tags: ["Remote", "Leadership", "Senior"],
    postedDate: "2026-03-20",
  },
  {
    id: "8",
    title: "Growth Product Manager",
    company: "Figma",
    location: "San Francisco, CA",
    type: "Full-time",
    salary: "$170k - $230k",
    score: 89,
    status: "ready",
    source: "Company",
    description: "Drive user acquisition and retention through data-driven product improvements.",
    requirements: [
      "4+ years PM experience",
      "Growth or marketing background",
      "Strong analytical skills",
      "A/B testing experience",
    ],
    tags: ["Hybrid", "Growth", "Design Tools"],
    postedDate: "2026-03-26",
  },
];

export const mockResumes: Resume[] = [
  {
    id: "1",
    name: "Master Resume - PM",
    type: "master",
    tags: ["Master", "Updated"],
    lastModified: "2026-03-28",
  },
  {
    id: "2",
    name: "Senior PM - Stripe (Tailored)",
    type: "tailored",
    tags: ["AI Generated", "Optimized"],
    linkedJobId: "1",
    lastModified: "2026-03-27",
  },
  {
    id: "3",
    name: "Technical PM - Vercel (Tailored)",
    type: "tailored",
    tags: ["AI Generated", "Optimized"],
    linkedJobId: "3",
    lastModified: "2026-03-26",
  },
  {
    id: "4",
    name: "Growth PM - Figma (Tailored)",
    type: "tailored",
    tags: ["AI Generated"],
    linkedJobId: "8",
    lastModified: "2026-03-25",
  },
];

export const mockApplications: Application[] = [
  {
    id: "1",
    jobId: "7",
    jobTitle: "Director of Product",
    company: "Linear",
    status: "applied",
    score: 81,
    resumeId: "1",
    appliedDate: "2026-03-22",
    source: "LinkedIn",
  },
  {
    id: "2",
    jobId: "1",
    jobTitle: "Senior Product Manager",
    company: "Stripe",
    status: "ready",
    score: 92,
    resumeId: "2",
    source: "LinkedIn",
  },
  {
    id: "3",
    jobId: "3",
    jobTitle: "Technical Product Manager",
    company: "Vercel",
    status: "ready",
    score: 88,
    resumeId: "3",
    source: "Company",
  },
  {
    id: "4",
    jobId: "8",
    jobTitle: "Growth Product Manager",
    company: "Figma",
    status: "ready",
    score: 89,
    resumeId: "4",
    source: "Company",
  },
];

export const mockActivityEvents: ActivityEvent[] = [
  {
    id: "1",
    type: "match_found",
    title: "High Match Found",
    description: "Senior Product Manager at Stripe (92% match)",
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    type: "resume_generated",
    title: "Resume Generated",
    description: "Created tailored resume for Figma role",
    timestamp: "5 hours ago",
  },
  {
    id: "3",
    type: "job_found",
    title: "New Jobs Found",
    description: "3 new jobs matching your criteria",
    timestamp: "1 day ago",
  },
  {
    id: "4",
    type: "application_sent",
    title: "Application Sent",
    description: "Applied to Director of Product at Linear",
    timestamp: "6 days ago",
  },
];

export const mockAnalyticsData = {
  jobsPerWeek: [
    { week: "Week 1", jobs: 12 },
    { week: "Week 2", jobs: 18 },
    { week: "Week 3", jobs: 15 },
    { week: "Week 4", jobs: 24 },
  ],
  scoreDistribution: [
    { range: "90-100", count: 3 },
    { range: "80-89", count: 5 },
    { range: "70-79", count: 4 },
    { range: "60-69", count: 2 },
    { range: "<60", count: 1 },
  ],
  sourcePerformance: [
    { source: "LinkedIn", jobs: 35, avgScore: 82 },
    { source: "Indeed", jobs: 18, avgScore: 75 },
    { source: "Company", jobs: 12, avgScore: 86 },
    { source: "AngelList", jobs: 8, avgScore: 79 },
  ],
  applicationFunnel: [
    { stage: "Jobs Found", count: 73 },
    { stage: "High Match", count: 12 },
    { stage: "Applied", count: 8 },
    { stage: "Interview", count: 3 },
    { stage: "Offer", count: 1 },
  ],
};
