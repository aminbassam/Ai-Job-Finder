export interface JobTitleOption {
  title: string;
  aliases?: string[];
}

const JOB_TITLE_OPTIONS: JobTitleOption[] = [
  // Product
  { title: "Associate Product Manager", aliases: ["APM"] },
  { title: "Product Manager", aliases: ["PM"] },
  { title: "Senior Product Manager", aliases: ["Senior PM"] },
  { title: "Staff Product Manager" },
  { title: "Principal Product Manager" },
  { title: "Lead Product Manager" },
  { title: "Technical Product Manager", aliases: ["TPM"] },
  { title: "Growth Product Manager" },
  { title: "Platform Product Manager" },
  { title: "AI Product Manager" },
  { title: "Product Owner" },
  { title: "Group Product Manager", aliases: ["GPM"] },
  { title: "Director of Product" },
  { title: "VP of Product" },
  { title: "Chief Product Officer", aliases: ["CPO"] },

  // Program / project / operations
  { title: "Program Manager" },
  { title: "Technical Program Manager", aliases: ["TPgM"] },
  { title: "Senior Program Manager" },
  { title: "Project Manager" },
  { title: "Scrum Master" },
  { title: "Business Operations Manager" },
  { title: "Strategy Manager" },
  { title: "Chief of Staff" },
  { title: "Operations Manager" },
  { title: "Business Analyst" },
  { title: "Business Systems Analyst" },
  { title: "Implementation Manager" },
  { title: "Solutions Consultant" },
  { title: "Customer Success Manager", aliases: ["CSM"] },
  { title: "Customer Support Specialist" },

  // Engineering leadership
  { title: "Engineering Manager", aliases: ["EM"] },
  { title: "Senior Engineering Manager" },
  { title: "Director of Engineering" },
  { title: "VP of Engineering" },
  { title: "Chief Technology Officer", aliases: ["CTO"] },
  { title: "Technical Lead", aliases: ["Tech Lead"] },
  { title: "Team Lead" },
  { title: "Architect" },
  { title: "Solutions Architect" },
  { title: "Enterprise Architect" },
  { title: "Cloud Architect" },
  { title: "Security Architect" },

  // Software engineering
  { title: "Software Engineer", aliases: ["SWE"] },
  { title: "Associate Software Engineer" },
  { title: "Junior Software Engineer" },
  { title: "Senior Software Engineer" },
  { title: "Staff Software Engineer" },
  { title: "Principal Software Engineer" },
  { title: "Full Stack Engineer", aliases: ["Fullstack Engineer", "Full Stack Developer"] },
  { title: "Frontend Engineer", aliases: ["Front End Engineer", "Frontend Developer"] },
  { title: "Backend Engineer", aliases: ["Back End Engineer", "Backend Developer"] },
  { title: "Mobile Engineer" },
  { title: "iOS Engineer", aliases: ["iOS Developer"] },
  { title: "Android Engineer", aliases: ["Android Developer"] },
  { title: "Web Developer" },
  { title: "Application Developer" },
  { title: "Systems Engineer" },
  { title: "Embedded Software Engineer" },
  { title: "Firmware Engineer" },
  { title: "Game Developer" },

  // Data / AI / ML
  { title: "Data Analyst" },
  { title: "Business Intelligence Analyst", aliases: ["BI Analyst"] },
  { title: "Data Scientist" },
  { title: "Senior Data Scientist" },
  { title: "Analytics Engineer" },
  { title: "Data Engineer" },
  { title: "Senior Data Engineer" },
  { title: "Machine Learning Engineer", aliases: ["ML Engineer"] },
  { title: "Applied Scientist" },
  { title: "Research Scientist" },
  { title: "AI Engineer" },
  { title: "Prompt Engineer" },
  { title: "Data Architect" },
  { title: "Business Intelligence Engineer", aliases: ["BI Engineer"] },
  { title: "Quantitative Analyst", aliases: ["Quant Analyst"] },

  // DevOps / infra / security
  { title: "DevOps Engineer" },
  { title: "Site Reliability Engineer", aliases: ["SRE"] },
  { title: "Platform Engineer" },
  { title: "Cloud Engineer" },
  { title: "Infrastructure Engineer" },
  { title: "Database Administrator", aliases: ["DBA"] },
  { title: "Network Engineer" },
  { title: "Systems Administrator", aliases: ["Sysadmin"] },
  { title: "Cybersecurity Analyst" },
  { title: "Security Engineer" },
  { title: "Application Security Engineer", aliases: ["AppSec Engineer"] },
  { title: "Security Operations Analyst", aliases: ["SOC Analyst"] },
  { title: "Penetration Tester", aliases: ["Pentester"] },

  // QA / IT
  { title: "QA Engineer" },
  { title: "Software Test Engineer", aliases: ["SDET"] },
  { title: "Quality Assurance Analyst" },
  { title: "Technical Support Engineer" },
  { title: "IT Support Specialist" },
  { title: "Help Desk Technician" },
  { title: "IT Manager" },

  // Design / research / content
  { title: "Product Designer" },
  { title: "UX Designer" },
  { title: "UI Designer" },
  { title: "UX Researcher" },
  { title: "Interaction Designer" },
  { title: "Visual Designer" },
  { title: "Graphic Designer" },
  { title: "Design Systems Designer" },
  { title: "Creative Director" },
  { title: "Content Designer" },
  { title: "Content Strategist" },
  { title: "Technical Writer" },
  { title: "Copywriter" },

  // Marketing / growth / content / comms
  { title: "Marketing Manager" },
  { title: "Growth Manager" },
  { title: "Growth Marketing Manager" },
  { title: "Performance Marketing Manager" },
  { title: "Demand Generation Manager" },
  { title: "Lifecycle Marketing Manager" },
  { title: "Email Marketing Manager" },
  { title: "Content Marketing Manager" },
  { title: "SEO Manager" },
  { title: "SEO Specialist" },
  { title: "SEM Specialist" },
  { title: "Social Media Manager" },
  { title: "Brand Manager" },
  { title: "Product Marketing Manager", aliases: ["PMM"] },
  { title: "Communications Manager" },
  { title: "Public Relations Manager", aliases: ["PR Manager"] },
  { title: "Community Manager" },

  // Sales / partnerships / rev ops
  { title: "Sales Development Representative", aliases: ["SDR"] },
  { title: "Business Development Representative", aliases: ["BDR"] },
  { title: "Account Executive", aliases: ["AE"] },
  { title: "Senior Account Executive" },
  { title: "Enterprise Account Executive" },
  { title: "Account Manager" },
  { title: "Sales Manager" },
  { title: "Director of Sales" },
  { title: "VP of Sales" },
  { title: "Revenue Operations Manager", aliases: ["RevOps Manager"] },
  { title: "Sales Operations Manager" },
  { title: "Partnerships Manager" },
  { title: "Channel Manager" },
  { title: "Customer Success Director" },

  // Recruiting / HR / people
  { title: "Recruiter" },
  { title: "Technical Recruiter" },
  { title: "Talent Acquisition Specialist" },
  { title: "Talent Acquisition Manager" },
  { title: "HR Generalist" },
  { title: "HR Manager" },
  { title: "People Operations Manager" },
  { title: "People Partner" },
  { title: "Compensation Analyst" },
  { title: "Learning and Development Manager" },

  // Finance / legal / admin
  { title: "Financial Analyst" },
  { title: "FP&A Analyst" },
  { title: "Finance Manager" },
  { title: "Accountant" },
  { title: "Senior Accountant" },
  { title: "Controller" },
  { title: "Chief Financial Officer", aliases: ["CFO"] },
  { title: "Legal Counsel" },
  { title: "Paralegal" },
  { title: "Office Manager" },
  { title: "Executive Assistant" },

  // Supply chain / logistics / manufacturing
  { title: "Supply Chain Analyst" },
  { title: "Supply Chain Manager" },
  { title: "Procurement Manager" },
  { title: "Logistics Coordinator" },
  { title: "Operations Analyst" },
  { title: "Manufacturing Engineer" },
  { title: "Industrial Engineer" },
  { title: "Mechanical Engineer" },
  { title: "Electrical Engineer" },
  { title: "Civil Engineer" },
  { title: "Chemical Engineer" },

  // Healthcare / science / education
  { title: "Clinical Research Coordinator" },
  { title: "Clinical Data Manager" },
  { title: "Healthcare Analyst" },
  { title: "Nurse Practitioner" },
  { title: "Registered Nurse", aliases: ["RN"] },
  { title: "Pharmacist" },
  { title: "Medical Assistant" },
  { title: "Instructional Designer" },
  { title: "Curriculum Designer" },
  { title: "Teacher" },
  { title: "Professor" },
  { title: "Academic Advisor" },

  // Real estate / customer-facing / misc
  { title: "Real Estate Analyst" },
  { title: "Property Manager" },
  { title: "Consultant" },
  { title: "Management Consultant" },
  { title: "Research Associate" },
  { title: "Administrative Assistant" },
];

export const JOB_TITLES = JOB_TITLE_OPTIONS.map((item) => item.title);

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function titleScore(option: JobTitleOption, query: string) {
  const title = normalize(option.title);
  const aliasValues = option.aliases?.map(normalize) ?? [];

  if (title === query) return 100;
  if (aliasValues.includes(query)) return 96;
  if (title.startsWith(query)) return 88;
  if (aliasValues.some((alias) => alias.startsWith(query))) return 82;
  if (title.split(/\s+/).some((word) => word.startsWith(query))) return 74;
  if (aliasValues.some((alias) => alias.split(/\s+/).some((word) => word.startsWith(query)))) return 70;
  if (title.includes(query)) return 62;
  if (aliasValues.some((alias) => alias.includes(query))) return 56;
  return 0;
}

export function searchJobTitles(query: string, limit = 8) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return JOB_TITLES.slice(0, limit);

  return JOB_TITLE_OPTIONS
    .map((option) => ({ option, score: titleScore(option, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.option.title.localeCompare(b.option.title))
    .slice(0, limit)
    .map((entry) => entry.option.title);
}
