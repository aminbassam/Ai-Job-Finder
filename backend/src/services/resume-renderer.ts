export type ResumeTitleFont =
  | "Playfair Display"
  | "Poppins"
  | "Space Grotesk"
  | "Merriweather"
  | "Libre Baskerville";

export type ResumeBodyFont =
  | "Source Sans 3"
  | "Inter"
  | "Lora"
  | "IBM Plex Sans"
  | "Work Sans";

export type ResumeTemplate = "modern" | "classic" | "compact";
export type ResumeDensity = "comfortable" | "balanced" | "compact";

export interface ResumeFormattingSettings {
  titleFont: ResumeTitleFont;
  bodyFont: ResumeBodyFont;
  accentColor: string;
  template: ResumeTemplate;
  density: ResumeDensity;
}

export const DEFAULT_RESUME_FORMATTING: ResumeFormattingSettings = {
  titleFont: "Playfair Display",
  bodyFont: "Source Sans 3",
  accentColor: "#2563EB",
  template: "modern",
  density: "balanced",
};

interface ResumeFormattingInput {
  titleFont?: string;
  bodyFont?: string;
  accentColor?: string;
  template?: string;
  density?: string;
}

interface Section {
  title: string;
  blocks: Block[];
}

type Block =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeColor(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : DEFAULT_RESUME_FORMATTING.accentColor;
}

export function normalizeResumeFormatting(
  partial: ResumeFormattingInput | null | undefined
): ResumeFormattingSettings {
  const titleFont = partial?.titleFont ?? DEFAULT_RESUME_FORMATTING.titleFont;
  const bodyFont = partial?.bodyFont ?? DEFAULT_RESUME_FORMATTING.bodyFont;
  const template = partial?.template ?? DEFAULT_RESUME_FORMATTING.template;
  const density = partial?.density ?? DEFAULT_RESUME_FORMATTING.density;

  return {
    titleFont: isTitleFont(titleFont) ? titleFont : DEFAULT_RESUME_FORMATTING.titleFont,
    bodyFont: isBodyFont(bodyFont) ? bodyFont : DEFAULT_RESUME_FORMATTING.bodyFont,
    accentColor: sanitizeColor(partial?.accentColor),
    template: isTemplate(template) ? template : DEFAULT_RESUME_FORMATTING.template,
    density: isDensity(density) ? density : DEFAULT_RESUME_FORMATTING.density,
  };
}

function isTitleFont(value: string): value is ResumeTitleFont {
  return [
    "Playfair Display",
    "Poppins",
    "Space Grotesk",
    "Merriweather",
    "Libre Baskerville",
  ].includes(value);
}

function isBodyFont(value: string): value is ResumeBodyFont {
  return [
    "Source Sans 3",
    "Inter",
    "Lora",
    "IBM Plex Sans",
    "Work Sans",
  ].includes(value);
}

function isTemplate(value: string): value is ResumeTemplate {
  return ["modern", "classic", "compact"].includes(value);
}

function isDensity(value: string): value is ResumeDensity {
  return ["comfortable", "balanced", "compact"].includes(value);
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

function normalizeLine(value: string): string {
  return stripMarkdownInline(value)
    .replace(/\s+/g, " ")
    .replace(/[•|]\s+/g, (match) => ` ${match.trim()} `)
    .trim();
}

function pushParagraph(buffer: string[], blocks: Block[]) {
  if (buffer.length === 0) return;
  const text = normalizeLine(buffer.join(" "));
  if (text) blocks.push({ type: "paragraph", text });
  buffer.length = 0;
}

function parseResume(markdown: string): { headerLines: string[]; sections: Section[] } {
  const lines = markdown
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const headerLines: string[] = [];
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  function ensureSection(title = "Professional Summary") {
    if (!currentSection) {
      currentSection = { title, blocks: [] };
      sections.push(currentSection);
    }
    return currentSection;
  }

  function flushList() {
    if (listBuffer.length === 0) return;
    ensureSection().blocks.push({ type: "list", items: [...listBuffer] });
    listBuffer = [];
  }

  function flushParagraph() {
    if (!currentSection) {
      for (const line of paragraphBuffer) {
        const normalized = normalizeLine(line);
        if (normalized) headerLines.push(normalized);
      }
      paragraphBuffer = [];
      return;
    }
    pushParagraph(paragraphBuffer, currentSection.blocks);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const heading = normalizeLine(headingMatch[1]);
      if (!headerLines.length && !sections.length) {
        headerLines.push(heading);
        currentSection = null;
      } else {
        currentSection = { title: heading, blocks: [] };
        sections.push(currentSection);
      }
      continue;
    }

    const dividerHeading = line.match(/^([A-Z][A-Za-z/& ]+):$/);
    if (dividerHeading && line.length < 48) {
      flushParagraph();
      flushList();
      currentSection = { title: normalizeLine(dividerHeading[1]), blocks: [] };
      sections.push(currentSection);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      listBuffer.push(normalizeLine(bulletMatch[1]));
      continue;
    }

    if (!sections.length && headerLines.length < 3) {
      headerLines.push(normalizeLine(line));
    } else {
      ensureSection();
      paragraphBuffer.push(line);
    }
  }

  flushParagraph();
  flushList();

  if (!sections.length && headerLines.length > 1) {
    const [first, ...rest] = headerLines;
    return {
      headerLines: [first],
      sections: [
        {
          title: "Professional Summary",
          blocks: rest.map((text) => ({ type: "paragraph", text })),
        },
      ],
    };
  }

  return { headerLines, sections };
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "• ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function densityValues(density: ResumeDensity) {
  if (density === "comfortable") {
    return { pagePadding: "44px", titleSize: "34px", bodySize: "15px", blockGap: "18px", listGap: "10px" };
  }
  if (density === "compact") {
    return { pagePadding: "28px", titleSize: "28px", bodySize: "13px", blockGap: "10px", listGap: "6px" };
  }
  return { pagePadding: "36px", titleSize: "31px", bodySize: "14px", blockGap: "14px", listGap: "8px" };
}

function templateCss(template: ResumeTemplate, accentColor: string) {
  if (template === "classic") {
    return `
      .resume-doc { border-top: 3px solid ${accentColor}; }
      .resume-section { padding-top: 10px; border-top: 1px solid rgba(15, 23, 42, 0.12); }
      .resume-section-title { letter-spacing: 0.18em; font-size: 11px; text-transform: uppercase; }
    `;
  }
  if (template === "compact") {
    return `
      .resume-doc { box-shadow: 0 22px 44px rgba(15, 23, 42, 0.12); }
      .resume-section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; }
      .resume-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    `;
  }
  return `
    .resume-section-title {
      position: relative;
      padding-left: 14px;
    }
    .resume-section-title::before {
      content: "";
      position: absolute;
      left: 0;
      top: 4px;
      bottom: 4px;
      width: 4px;
      border-radius: 999px;
      background: ${accentColor};
    }
  `;
}

export function renderResumeHtml(input: {
  title: string;
  markdown: string;
  formatting?: Partial<ResumeFormattingSettings> | null;
}): string {
  const formatting = normalizeResumeFormatting(input.formatting);
  const content = parseResume(input.markdown);
  const density = densityValues(formatting.density);
  const headerTitle = escapeHtml(content.headerLines[0] ?? input.title);
  const headerMeta = content.headerLines.slice(1).map((line) => escapeHtml(line));

  const sectionsHtml = content.sections
    .map((section) => {
      const blocksHtml = section.blocks
        .map((block) => {
          if (block.type === "list") {
            return `<ul class="resume-list">${block.items
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join("")}</ul>`;
          }
          return `<p class="resume-paragraph">${escapeHtml(block.text)}</p>`;
        })
        .join("");

      return `
        <section class="resume-section">
          <h2 class="resume-section-title">${escapeHtml(section.title)}</h2>
          <div class="resume-section-body">${blocksHtml}</div>
        </section>
      `;
    })
    .join("");

  return `
    <article
      class="resume-doc resume-template-${formatting.template}"
      style="--resume-accent:${formatting.accentColor};--resume-title-font:'${formatting.titleFont}',serif;--resume-body-font:'${formatting.bodyFont}',sans-serif;"
    >
      <style>
        .resume-doc {
          background: #ffffff;
          color: #0f172a;
          border-radius: 20px;
          padding: ${density.pagePadding};
          font-family: var(--resume-body-font);
          font-size: ${density.bodySize};
          line-height: 1.65;
          box-shadow: 0 30px 70px rgba(15, 23, 42, 0.18);
        }
        .resume-header {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 28px;
          padding-bottom: 18px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.12);
        }
        .resume-title {
          margin: 0;
          font-family: var(--resume-title-font);
          font-size: ${density.titleSize};
          line-height: 1.1;
          letter-spacing: -0.03em;
          color: #0f172a;
        }
        .resume-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 16px;
          color: #475569;
          font-size: 13px;
        }
        .resume-meta-line {
          position: relative;
        }
        .resume-section {
          display: flex;
          flex-direction: column;
          gap: ${density.blockGap};
          margin-top: ${density.blockGap};
        }
        .resume-section-title {
          margin: 0;
          font-family: var(--resume-title-font);
          color: var(--resume-accent);
          font-weight: 700;
        }
        .resume-section-body {
          display: flex;
          flex-direction: column;
          gap: ${density.blockGap};
        }
        .resume-paragraph {
          margin: 0;
          white-space: pre-wrap;
        }
        .resume-list {
          margin: 0;
          padding-left: 20px;
          display: grid;
          gap: ${density.listGap};
        }
        .resume-list li::marker {
          color: var(--resume-accent);
        }
        ${templateCss(formatting.template, formatting.accentColor)}
        @media (max-width: 640px) {
          .resume-doc { padding: 22px; }
          .resume-title { font-size: 26px; }
          .resume-list { grid-template-columns: 1fr; }
        }
      </style>
      <header class="resume-header">
        <h1 class="resume-title">${headerTitle}</h1>
        ${
          headerMeta.length > 0
            ? `<div class="resume-meta">${headerMeta
                .map((line) => `<span class="resume-meta-line">${line}</span>`)
                .join("")}</div>`
            : ""
        }
      </header>
      ${sectionsHtml}
    </article>
  `.trim();
}
