import { transaction, queryOne, query } from "../db/pool";
import { getGlobalAiSettings } from "./ai-global-settings";

export interface MasterResumeBulletInput {
  id?: string;
  description?: string;
  tools?: string[];
  keywords?: string[];
}

export interface MasterResumeCustomSectionInput {
  id?: string;
  name: string;
  description: string;
}

export interface MasterResumeExperienceInput {
  id?: string;
  title: string;
  company: string;
  startDate?: string | null;
  endDate?: string | null;
  bullets: MasterResumeBulletInput[];
}

export interface MasterResumeSkillsInput {
  core: string[];
  tools: string[];
  soft: string[];
  certifications: string[];
}

export interface MasterResumeEducationInput {
  id?: string;
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string;
}

export interface MasterResumeProjectInput {
  id?: string;
  name: string;
  role?: string;
  description?: string;
  tools: string[];
  teamSize?: number | null;
  outcome?: string;
  metrics?: string;
}

export interface MasterResumeLeadershipInput {
  teamSize?: number | null;
  scope?: string;
  stakeholders: string[];
  budget?: string;
}

export interface MasterResumeProfileInput {
  name: string;
  targetRoles: string[];
  summary?: string;
  experienceYears?: number | null;
  isActive?: boolean;
  useForAi?: boolean;
  isDefault?: boolean;
  sourceImportId?: string | null;
  experiences: MasterResumeExperienceInput[];
  skills: MasterResumeSkillsInput;
  education: MasterResumeEducationInput[];
  projects: MasterResumeProjectInput[];
  leadership?: MasterResumeLeadershipInput | null;
  customSections?: MasterResumeCustomSectionInput[];
}

export interface MasterResumeProfileAggregate {
  id: string;
  masterResumeId: string;
  sourceImportId?: string | null;
  name: string;
  targetRoles: string[];
  summary?: string | null;
  experienceYears: number;
  isActive: boolean;
  useForAi: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  experiences: Array<{
    id: string;
    title: string;
    company: string;
    startDate?: string | null;
    endDate?: string | null;
    bullets: Array<{
      id: string;
      description: string;
      tools: string[];
      keywords: string[];
    }>;
  }>;
  skills: MasterResumeSkillsInput;
  education: Array<{
    id: string;
    school: string;
    degree?: string | null;
    fieldOfStudy?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
    role?: string | null;
    description?: string | null;
    tools: string[];
    teamSize?: number | null;
    outcome?: string | null;
    metrics?: string | null;
  }>;
  leadership?: {
    teamSize?: number | null;
    scope?: string | null;
    stakeholders: string[];
    budget?: string | null;
  } | null;
  customSections: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

function dedupe(items?: string[] | null): string[] {
  return Array.from(new Set((items ?? []).map((item) => item.trim()).filter(Boolean)));
}

export async function ensureMasterResume(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO master_resumes (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId]
  );
  if (!row) throw new Error("Failed to initialize master resume.");
  return row.id;
}

export async function saveMasterResumeProfile(userId: string, input: MasterResumeProfileInput, profileId?: string): Promise<MasterResumeProfileAggregate> {
  const masterResumeId = await ensureMasterResume(userId);

  await transaction(async (q) => {
    if (input.isDefault) {
      await q(
        `UPDATE master_resume_profiles
         SET is_default = false, updated_at = now()
         WHERE master_resume_id = $1`,
        [masterResumeId]
      );
    }

    let savedProfileId = profileId;
    if (profileId) {
      await q(
        `UPDATE master_resume_profiles
         SET name = $2,
             target_roles = $3::text[],
             summary = $4,
             experience_years = $5,
             is_active = $6,
             use_for_ai = $7,
             is_default = $8,
             source_import_id = $9,
             updated_at = now()
         WHERE id = $1 AND master_resume_id = $10`,
        [
          profileId,
          input.name.trim(),
          dedupe(input.targetRoles),
          input.summary?.trim() ?? null,
          input.experienceYears ?? 0,
          input.isActive !== false,
          input.useForAi !== false,
          input.isActive === false ? false : Boolean(input.isDefault),
          input.sourceImportId ?? null,
          masterResumeId,
        ]
      );

      await q(
        `DELETE FROM master_resume_skills WHERE profile_id = $1`,
        [profileId]
      );
      await q(
        `DELETE FROM master_resume_leadership WHERE profile_id = $1`,
        [profileId]
      );
      await q(
        `DELETE FROM master_resume_projects WHERE profile_id = $1`,
        [profileId]
      );
      await q(
        `DELETE FROM master_resume_education WHERE profile_id = $1`,
        [profileId]
      );
      await q(
        `DELETE FROM master_resume_experiences WHERE profile_id = $1`,
        [profileId]
      );
      await q(
        `DELETE FROM master_resume_custom_sections WHERE profile_id = $1`,
        [profileId]
      );
    } else {
      const rows = await q(
        `INSERT INTO master_resume_profiles (
           master_resume_id, source_import_id, name, target_roles, summary, experience_years, is_active, use_for_ai, is_default
         ) VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          masterResumeId,
          input.sourceImportId ?? null,
          input.name.trim(),
          dedupe(input.targetRoles),
          input.summary?.trim() ?? null,
          input.experienceYears ?? 0,
          input.isActive !== false,
          input.useForAi !== false,
          input.isActive === false ? false : Boolean(input.isDefault),
        ]
      );
      savedProfileId = (rows[0] as { id: string }).id;
    }

    if (!savedProfileId) {
      throw new Error("Failed to save master resume profile.");
    }

    await q(
      `INSERT INTO master_resume_skills (profile_id, core, tools, soft, certifications)
       VALUES ($1, $2::text[], $3::text[], $4::text[], $5::text[])`,
      [
        savedProfileId,
        dedupe(input.skills.core),
        dedupe(input.skills.tools),
        dedupe(input.skills.soft),
        dedupe(input.skills.certifications),
      ]
    );

    if (input.leadership && (input.leadership.scope || input.leadership.teamSize || input.leadership.budget || input.leadership.stakeholders.length > 0)) {
      await q(
        `INSERT INTO master_resume_leadership (profile_id, team_size, scope, stakeholders, budget)
         VALUES ($1, $2, $3, $4::text[], $5)`,
        [
          savedProfileId,
          input.leadership.teamSize ?? null,
          input.leadership.scope?.trim() ?? null,
          dedupe(input.leadership.stakeholders),
          input.leadership.budget?.trim() ?? null,
        ]
      );
    }

    for (const [educationIndex, education] of input.education.entries()) {
      await q(
        `INSERT INTO master_resume_education (
           profile_id, school, degree, field_of_study, start_date, end_date, notes, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          savedProfileId,
          education.school.trim(),
          education.degree?.trim() ?? null,
          education.fieldOfStudy?.trim() ?? null,
          education.startDate ?? null,
          education.endDate ?? null,
          education.notes?.trim() ?? null,
          educationIndex,
        ]
      );
    }

    for (const [projectIndex, project] of input.projects.entries()) {
      const projectRows = await q(
        `INSERT INTO master_resume_projects (
           profile_id, name, role, description, tools, team_size, outcome, metrics, sort_order
         ) VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9)
         RETURNING id`,
        [
          savedProfileId,
          project.name.trim(),
          project.role?.trim() ?? null,
          project.description?.trim() ?? null,
          dedupe(project.tools),
          project.teamSize ?? null,
          project.outcome?.trim() ?? null,
          project.metrics?.trim() ?? null,
          projectIndex,
        ]
      );
      void projectRows;
    }

    for (const [experienceIndex, experience] of input.experiences.entries()) {
      const experienceRows = await q(
        `INSERT INTO master_resume_experiences (
           profile_id, title, company, start_date, end_date, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          savedProfileId,
          experience.title.trim(),
          experience.company.trim(),
          experience.startDate ?? null,
          experience.endDate ?? null,
          experienceIndex,
        ]
      );
      const savedExperienceId = (experienceRows[0] as { id: string }).id;

      for (const [bulletIndex, bullet] of experience.bullets.entries()) {
        await q(
          `INSERT INTO master_resume_bullets (
             experience_id, original_text, tools, keywords, sort_order
           ) VALUES ($1, $2, $3::text[], $4::text[], $5)`,
          [
            savedExperienceId,
            bullet.description?.trim() ?? null,
            dedupe(bullet.tools),
            dedupe(bullet.keywords),
            bulletIndex,
          ]
        );
      }
    }

    for (const [sectionIndex, section] of (input.customSections ?? []).entries()) {
      if (!section.name?.trim()) continue;
      await q(
        `INSERT INTO master_resume_custom_sections (profile_id, name, description, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [
          savedProfileId,
          section.name.trim(),
          section.description?.trim() ?? "",
          sectionIndex,
        ]
      );
    }
  });

  const targetId = profileId ?? (await queryOne<{ id: string }>(
    `SELECT id
     FROM master_resume_profiles
     WHERE master_resume_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [masterResumeId]
  ))?.id;

  if (!targetId) throw new Error("Failed to load saved profile.");
  const saved = await getMasterResumeProfile(userId, targetId);
  if (!saved) throw new Error("Failed to load saved profile.");
  return saved;
}

export async function getMasterResumeProfiles(userId: string): Promise<MasterResumeProfileAggregate[]> {
  const masterResumeId = await ensureMasterResume(userId);
  const profiles = await query<Record<string, unknown>>(
    `SELECT *
     FROM master_resume_profiles
     WHERE master_resume_id = $1
     ORDER BY is_active DESC, use_for_ai DESC, updated_at DESC, created_at DESC`,
    [masterResumeId]
  );

  const results = await Promise.all(
    profiles.map((profile) => getMasterResumeProfile(userId, String(profile.id)))
  );
  return results.filter((profile): profile is MasterResumeProfileAggregate => Boolean(profile));
}

export async function getMasterResumeProfile(userId: string, profileId: string): Promise<MasterResumeProfileAggregate | null> {
  const masterResumeId = await ensureMasterResume(userId);
  const profile = await queryOne<Record<string, unknown>>(
    `SELECT *
     FROM master_resume_profiles
     WHERE id = $1 AND master_resume_id = $2`,
    [profileId, masterResumeId]
  );

  if (!profile) return null;

  const experiences = await query<Record<string, unknown>>(
    `SELECT * FROM master_resume_experiences
     WHERE profile_id = $1
     ORDER BY sort_order, created_at`,
    [profileId]
  );
  const bullets = await query<Record<string, unknown>>(
    `SELECT * FROM master_resume_bullets
     WHERE experience_id = ANY(
       SELECT id FROM master_resume_experiences WHERE profile_id = $1
     )
     ORDER BY sort_order, created_at`,
    [profileId]
  );
  const skills = await queryOne<Record<string, unknown>>(
    `SELECT * FROM master_resume_skills WHERE profile_id = $1`,
    [profileId]
  );
  const education = await query<Record<string, unknown>>(
    `SELECT * FROM master_resume_education
     WHERE profile_id = $1
     ORDER BY sort_order, created_at`,
    [profileId]
  );
  const projects = await query<Record<string, unknown>>(
    `SELECT * FROM master_resume_projects
     WHERE profile_id = $1
     ORDER BY sort_order, created_at`,
    [profileId]
  );
  const leadership = await queryOne<Record<string, unknown>>(
    `SELECT * FROM master_resume_leadership WHERE profile_id = $1`,
    [profileId]
  );
  const customSections = await query<Record<string, unknown>>(
    `SELECT * FROM master_resume_custom_sections
     WHERE profile_id = $1
     ORDER BY sort_order, created_at`,
    [profileId]
  );

  return {
    id: String(profile.id),
    masterResumeId: String(profile.master_resume_id),
    sourceImportId: profile.source_import_id ? String(profile.source_import_id) : null,
    name: String(profile.name),
    targetRoles: (profile.target_roles as string[] | null) ?? [],
    summary: (profile.summary as string | null) ?? null,
    experienceYears: Number(profile.experience_years ?? 0),
    isActive: Boolean(profile.is_active ?? true),
    useForAi: Boolean(profile.use_for_ai ?? true),
    isDefault: Boolean(profile.is_default),
    createdAt: String(profile.created_at),
    updatedAt: String(profile.updated_at),
    experiences: experiences.map((experience) => ({
      id: String(experience.id),
      title: String(experience.title),
      company: String(experience.company),
      startDate: experience.start_date ? String(experience.start_date) : null,
      endDate: experience.end_date ? String(experience.end_date) : null,
      bullets: bullets
        .filter((bullet) => String(bullet.experience_id) === String(experience.id))
        .map((bullet) => ({
          id: String(bullet.id),
          description: (bullet.original_text as string | null) ?? "",
          tools: (bullet.tools as string[] | null) ?? [],
          keywords: (bullet.keywords as string[] | null) ?? [],
        })),
    })),
    skills: {
      core: (skills?.core as string[] | null) ?? [],
      tools: (skills?.tools as string[] | null) ?? [],
      soft: (skills?.soft as string[] | null) ?? [],
      certifications: (skills?.certifications as string[] | null) ?? [],
    },
    education: education.map((item) => ({
      id: String(item.id),
      school: String(item.school),
      degree: (item.degree as string | null) ?? null,
      fieldOfStudy: (item.field_of_study as string | null) ?? null,
      startDate: item.start_date ? String(item.start_date) : null,
      endDate: item.end_date ? String(item.end_date) : null,
      notes: (item.notes as string | null) ?? null,
    })),
    projects: projects.map((project) => ({
      id: String(project.id),
      name: String(project.name),
      role: (project.role as string | null) ?? null,
      description: (project.description as string | null) ?? null,
      tools: (project.tools as string[] | null) ?? [],
      teamSize: project.team_size != null ? Number(project.team_size) : null,
      outcome: (project.outcome as string | null) ?? null,
      metrics: (project.metrics as string | null) ?? null,
    })),
    leadership: leadership
      ? {
          teamSize: leadership.team_size != null ? Number(leadership.team_size) : null,
          scope: (leadership.scope as string | null) ?? null,
          stakeholders: (leadership.stakeholders as string[] | null) ?? [],
          budget: (leadership.budget as string | null) ?? null,
        }
      : null,
    customSections: customSections.map((section) => ({
      id: String(section.id),
      name: String(section.name),
      description: (section.description as string | null) ?? "",
    })),
  };
}

export async function deleteMasterResumeProfile(userId: string, profileId: string): Promise<boolean> {
  const masterResumeId = await ensureMasterResume(userId);
  const rows = await query<{ id: string }>(
    `DELETE FROM master_resume_profiles
     WHERE id = $1 AND master_resume_id = $2
     RETURNING id`,
    [profileId, masterResumeId]
  );
  return rows.length > 0;
}

export async function listMasterResumeImports(userId: string): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT id, source_type, source_url, file_name, raw_text, parsed_json, created_at
     FROM master_resume_imports
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
}

export async function saveMasterResumeImport(userId: string, data: {
  sourceType: "linkedin" | "upload";
  sourceUrl?: string | null;
  fileName?: string | null;
  rawText: string;
  parsedJson: Record<string, unknown>;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO master_resume_imports (user_id, source_type, source_url, file_name, raw_text, parsed_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      userId,
      data.sourceType,
      data.sourceUrl ?? null,
      data.fileName ?? null,
      data.rawText,
      JSON.stringify(data.parsedJson),
    ]
  );
  if (!row) throw new Error("Failed to save import.");
  return row.id;
}

export async function getDefaultMasterResumeContext(userId: string): Promise<string | null> {
  const globalAiSettings = await getGlobalAiSettings(userId);
  const masterResumeId = await ensureMasterResume(userId);
  const profiles = await query<Record<string, unknown>>(
    `SELECT id
     FROM master_resume_profiles
     WHERE master_resume_id = $1
       AND is_active = true
       AND use_for_ai = true
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 2`,
    [masterResumeId]
  );

  const profileIds = profiles.map((profile) => String(profile.id));
  const profileContext = profileIds.length > 0
    ? await getMasterResumeContextForProfiles(userId, profileIds)
    : null;
  const legacyContext = globalAiSettings.useLegacyResumePreferencesForAi
    ? await getLegacyResumePreferencesContext(userId)
    : null;
  const combined = [profileContext, legacyContext]
    .filter((item): item is string => Boolean(item?.trim()))
    .join("\n\n===\n\n");

  return combined || null;
}

export async function getLegacyResumePreferencesContext(userId: string): Promise<string | null> {
  const profile = await queryOne<Record<string, unknown>>(
    `SELECT up.professional_summary, up.years_experience,
            COALESCE(
              json_agg(us.skill_name ORDER BY us.years_experience DESC NULLS LAST)
                FILTER (WHERE us.skill_name IS NOT NULL),
              '[]'
            ) AS skills
     FROM user_profiles up
     LEFT JOIN user_skills us ON us.user_id = up.user_id
     WHERE up.user_id = $1
     GROUP BY up.user_id, up.professional_summary, up.years_experience`,
    [userId]
  );
  const prefs = await queryOne<Record<string, unknown>>(
    `SELECT executive_skills, key_achievements, certifications, tools_technologies,
            soft_skills, target_roles, seniority_level, industry_focus, must_have_keywords
     FROM resume_preferences
     WHERE user_id = $1`,
    [userId]
  );

  const lines: string[] = ["Resume source: Legacy Preferences"];
  if (profile?.professional_summary) lines.push(`Summary: ${profile.professional_summary}`);
  if (profile?.years_experience) lines.push(`Experience years: ${profile.years_experience}`);
  if (Array.isArray(profile?.skills) && profile.skills.length > 0) lines.push(`Skills: ${(profile.skills as string[]).join(", ")}`);
  if (Array.isArray(prefs?.target_roles) && prefs.target_roles.length > 0) lines.push(`Target roles: ${(prefs.target_roles as string[]).join(", ")}`);
  if (prefs?.seniority_level) lines.push(`Seniority level: ${prefs.seniority_level}`);
  if (prefs?.executive_skills) lines.push(`Executive skills: ${prefs.executive_skills}`);
  if (prefs?.key_achievements) lines.push(`Key achievements: ${prefs.key_achievements}`);
  if (prefs?.certifications) lines.push(`Certifications: ${prefs.certifications}`);
  if (Array.isArray(prefs?.tools_technologies) && prefs.tools_technologies.length > 0) lines.push(`Tools: ${(prefs.tools_technologies as string[]).join(", ")}`);
  if (Array.isArray(prefs?.soft_skills) && prefs.soft_skills.length > 0) lines.push(`Soft skills: ${(prefs.soft_skills as string[]).join(", ")}`);
  if (Array.isArray(prefs?.industry_focus) && prefs.industry_focus.length > 0) lines.push(`Industry focus: ${(prefs.industry_focus as string[]).join(", ")}`);
  if (Array.isArray(prefs?.must_have_keywords) && prefs.must_have_keywords.length > 0) lines.push(`Must-have keywords: ${(prefs.must_have_keywords as string[]).join(", ")}`);

  return lines.length > 1 ? lines.join("\n") : null;
}

export async function getMasterResumeContextForProfile(userId: string, profileId: string): Promise<string | null> {
  const aggregate = await getMasterResumeProfile(userId, profileId);
  if (!aggregate) return null;

  const lines: string[] = [];
  lines.push(`Master resume profile: ${aggregate.name}`);
  if (aggregate.targetRoles.length > 0) lines.push(`Target roles: ${aggregate.targetRoles.join(", ")}`);
  if (aggregate.summary) lines.push(`Summary: ${aggregate.summary}`);
  if (aggregate.experienceYears > 0) lines.push(`Experience years: ${aggregate.experienceYears}`);
  if (aggregate.skills.core.length > 0) lines.push(`Core skills: ${aggregate.skills.core.join(", ")}`);
  if (aggregate.skills.tools.length > 0) lines.push(`Tools: ${aggregate.skills.tools.join(", ")}`);
  if (aggregate.skills.certifications.length > 0) lines.push(`Certifications: ${aggregate.skills.certifications.join(", ")}`);
  for (const education of aggregate.education.slice(0, 4)) {
    const educationLine = [
      education.degree,
      education.fieldOfStudy,
      education.school,
    ].filter(Boolean).join(" • ");
    if (educationLine) lines.push(`Education: ${educationLine}`);
    const educationDates = [education.startDate, education.endDate].filter(Boolean).join(" to ");
    if (educationDates) lines.push(`Education dates: ${educationDates}`);
    if (education.notes) lines.push(`Education notes: ${education.notes}`);
  }

  for (const experience of aggregate.experiences.slice(0, 6)) {
    lines.push(`Experience: ${experience.title} at ${experience.company}`);
    for (const bullet of experience.bullets.slice(0, 4)) {
      if (bullet.description) lines.push(`- ${bullet.description}`);
    }
  }

  for (const section of aggregate.customSections.slice(0, 6)) {
    lines.push(`${section.name}: ${section.description}`);
  }

  return lines.filter(Boolean).join("\n");
}

export async function getMasterResumeContextForProfiles(userId: string, profileIds: string[]): Promise<string | null> {
  const uniqueIds = Array.from(new Set(profileIds.map((profileId) => profileId.trim()).filter(Boolean))).slice(0, 2);
  if (uniqueIds.length === 0) return null;

  const contexts = await Promise.all(
    uniqueIds.map((profileId) => getMasterResumeContextForProfile(userId, profileId))
  );

  const nonEmptyContexts = contexts.filter((context): context is string => Boolean(context?.trim()));
  if (nonEmptyContexts.length === 0) return null;

  return nonEmptyContexts
    .map((context, index) => `Master Resume Profile ${index + 1}\n${context}`)
    .join("\n\n---\n\n");
}
