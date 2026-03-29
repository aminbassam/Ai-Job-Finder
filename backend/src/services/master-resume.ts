import { transaction, queryOne, query } from "../db/pool";

export interface MasterResumeBulletInput {
  id?: string;
  action?: string;
  method?: string;
  result?: string;
  metric?: string;
  tools?: string[];
  keywords?: string[];
  originalText?: string;
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
  isDefault?: boolean;
  sourceImportId?: string | null;
  experiences: MasterResumeExperienceInput[];
  skills: MasterResumeSkillsInput;
  projects: MasterResumeProjectInput[];
  leadership?: MasterResumeLeadershipInput | null;
}

export interface MasterResumeProfileAggregate {
  id: string;
  masterResumeId: string;
  sourceImportId?: string | null;
  name: string;
  targetRoles: string[];
  summary?: string | null;
  experienceYears: number;
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
      action?: string | null;
      method?: string | null;
      result?: string | null;
      metric?: string | null;
      tools: string[];
      keywords: string[];
      originalText?: string | null;
    }>;
  }>;
  skills: MasterResumeSkillsInput;
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
             is_default = $6,
             source_import_id = $7,
             updated_at = now()
         WHERE id = $1 AND master_resume_id = $8`,
        [
          profileId,
          input.name.trim(),
          dedupe(input.targetRoles),
          input.summary?.trim() ?? null,
          input.experienceYears ?? 0,
          Boolean(input.isDefault),
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
        `DELETE FROM master_resume_experiences WHERE profile_id = $1`,
        [profileId]
      );
    } else {
      const rows = await q(
        `INSERT INTO master_resume_profiles (
           master_resume_id, source_import_id, name, target_roles, summary, experience_years, is_default
         ) VALUES ($1, $2, $3, $4::text[], $5, $6, $7)
         RETURNING id`,
        [
          masterResumeId,
          input.sourceImportId ?? null,
          input.name.trim(),
          dedupe(input.targetRoles),
          input.summary?.trim() ?? null,
          input.experienceYears ?? 0,
          Boolean(input.isDefault),
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
             experience_id, action, method, result, metric, tools, keywords, original_text, sort_order
           ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9)`,
          [
            savedExperienceId,
            bullet.action?.trim() ?? null,
            bullet.method?.trim() ?? null,
            bullet.result?.trim() ?? null,
            bullet.metric?.trim() ?? null,
            dedupe(bullet.tools),
            dedupe(bullet.keywords),
            bullet.originalText?.trim() ?? null,
            bulletIndex,
          ]
        );
      }
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
     ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
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

  return {
    id: String(profile.id),
    masterResumeId: String(profile.master_resume_id),
    sourceImportId: profile.source_import_id ? String(profile.source_import_id) : null,
    name: String(profile.name),
    targetRoles: (profile.target_roles as string[] | null) ?? [],
    summary: (profile.summary as string | null) ?? null,
    experienceYears: Number(profile.experience_years ?? 0),
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
          action: (bullet.action as string | null) ?? null,
          method: (bullet.method as string | null) ?? null,
          result: (bullet.result as string | null) ?? null,
          metric: (bullet.metric as string | null) ?? null,
          tools: (bullet.tools as string[] | null) ?? [],
          keywords: (bullet.keywords as string[] | null) ?? [],
          originalText: (bullet.original_text as string | null) ?? null,
        })),
    })),
    skills: {
      core: (skills?.core as string[] | null) ?? [],
      tools: (skills?.tools as string[] | null) ?? [],
      soft: (skills?.soft as string[] | null) ?? [],
      certifications: (skills?.certifications as string[] | null) ?? [],
    },
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
  const masterResumeId = await ensureMasterResume(userId);
  const profile = await queryOne<Record<string, unknown>>(
    `SELECT id
     FROM master_resume_profiles
     WHERE master_resume_id = $1
     ORDER BY is_default DESC, updated_at DESC
     LIMIT 1`,
    [masterResumeId]
  );

  if (!profile?.id) return null;
  const aggregate = await getMasterResumeProfile(userId, String(profile.id));
  if (!aggregate) return null;

  const lines: string[] = [];
  lines.push(`Master resume profile: ${aggregate.name}`);
  if (aggregate.targetRoles.length > 0) lines.push(`Target roles: ${aggregate.targetRoles.join(", ")}`);
  if (aggregate.summary) lines.push(`Summary: ${aggregate.summary}`);
  if (aggregate.experienceYears > 0) lines.push(`Experience years: ${aggregate.experienceYears}`);
  if (aggregate.skills.core.length > 0) lines.push(`Core skills: ${aggregate.skills.core.join(", ")}`);
  if (aggregate.skills.tools.length > 0) lines.push(`Tools: ${aggregate.skills.tools.join(", ")}`);
  if (aggregate.skills.certifications.length > 0) lines.push(`Certifications: ${aggregate.skills.certifications.join(", ")}`);

  for (const experience of aggregate.experiences.slice(0, 6)) {
    lines.push(`Experience: ${experience.title} at ${experience.company}`);
    for (const bullet of experience.bullets.slice(0, 4)) {
      const bulletText = [bullet.action, bullet.method, bullet.result, bullet.metric, bullet.originalText]
        .filter(Boolean)
        .join(" | ");
      if (bulletText) lines.push(`- ${bulletText}`);
    }
  }

  for (const project of aggregate.projects.slice(0, 4)) {
    lines.push(`Project: ${project.name}${project.role ? ` (${project.role})` : ""}`);
    lines.push([project.description, project.outcome, project.metrics].filter(Boolean).join(" | "));
  }

  if (aggregate.leadership) {
    if (aggregate.leadership.teamSize) lines.push(`Leadership team size: ${aggregate.leadership.teamSize}`);
    if (aggregate.leadership.scope) lines.push(`Leadership scope: ${aggregate.leadership.scope}`);
    if (aggregate.leadership.stakeholders.length > 0) lines.push(`Stakeholders: ${aggregate.leadership.stakeholders.join(", ")}`);
    if (aggregate.leadership.budget) lines.push(`Budget: ${aggregate.leadership.budget}`);
  }

  return lines.filter(Boolean).join("\n");
}
