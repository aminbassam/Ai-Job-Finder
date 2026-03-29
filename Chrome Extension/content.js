// JobFlow AI — Content Script
// Extracts job data from the current page using site-specific + generic extractors.

(function () {
  "use strict";

  // ── Utilities ──────────────────────────────────────────────────────────────

  function text(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? el.innerText.trim() : null;
  }

  function attr(selector, attribute, root = document) {
    const el = root.querySelector(selector);
    return el ? (el.getAttribute(attribute) ?? "").trim() : null;
  }

  function firstText(...selectors) {
    for (const sel of selectors) {
      const t = text(sel);
      if (t) return t;
    }
    return null;
  }

  function parseSalary(raw) {
    if (!raw) return { salaryMin: null, salaryMax: null };
    // Strip currency symbols, commas
    const cleaned = raw.replace(/[$,£€]/g, "").replace(/\s+/g, " ").toLowerCase();
    // Match ranges like "80,000 - 120,000" or "80k - 120k"
    const rangeMatch = cleaned.match(/([\d.]+)k?\s*[-–—to]+\s*([\d.]+)k?/);
    if (rangeMatch) {
      let lo = parseFloat(rangeMatch[1]);
      let hi = parseFloat(rangeMatch[2]);
      if (cleaned.includes("k") || (lo < 500 && hi < 500)) { lo *= 1000; hi *= 1000; }
      // Hourly detection
      if (cleaned.includes("/hr") || cleaned.includes("hour") || cleaned.includes("per hour")) {
        lo *= 2080; hi *= 2080;
      }
      return { salaryMin: Math.round(lo), salaryMax: Math.round(hi) };
    }
    // Single value
    const single = cleaned.match(/([\d.]+)k?/);
    if (single) {
      let val = parseFloat(single[1]);
      if (cleaned.includes("k") || val < 500) val *= 1000;
      return { salaryMin: Math.round(val), salaryMax: null };
    }
    return { salaryMin: null, salaryMax: null };
  }

  function detectRemote(location, title, description) {
    // Only check title and location — descriptions often mention "remote" tools
    // or "remote team" on in-office roles, causing false positives.
    const titleLoc = `${location ?? ""} ${title ?? ""}`.toLowerCase();
    if (/\bremote\b|\bwork from home\b|\bwfh\b|\bfully remote\b|\banywhere\b/.test(titleLoc)) return true;
    // Also accept clear explicit signals in the very first line of the description
    const firstLine = (description ?? "").split("\n")[0].toLowerCase();
    return /\bfully remote\b|\b100%\s*remote\b|\bwork from home\b/.test(firstLine);
  }

  function slugify(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "").split(".")[0];
    } catch {
      return "extension";
    }
  }

  // ── JSON-LD extractor ──────────────────────────────────────────────────────

  function extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const posting = [data, ...(data["@graph"] ?? [])].find(
          (d) => d?.["@type"] === "JobPosting"
        );
        if (!posting) continue;

        const title = posting.title ?? null;
        const company =
          posting.hiringOrganization?.name ?? null;
        const location =
          posting.jobLocation?.address?.addressLocality
            ? [
                posting.jobLocation.address.addressLocality,
                posting.jobLocation.address.addressRegion,
                posting.jobLocation.address.addressCountry,
              ]
                .filter(Boolean)
                .join(", ")
            : null;
        const description =
          posting.description
            ? posting.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : null;
        const remote = posting.jobLocationType === "TELECOMMUTE" || detectRemote(location, title, description);
        const salarySpec = posting.baseSalary?.value;
        let salaryMin = null, salaryMax = null;
        if (salarySpec) {
          if (salarySpec["@type"] === "MonetaryAmountDistribution") {
            salaryMin = salarySpec.minValue ?? null;
            salaryMax = salarySpec.maxValue ?? null;
          } else {
            salaryMin = salarySpec.value ?? null;
          }
        }

        return { title, company, location, description, remote, salaryMin, salaryMax };
      } catch { /* continue */ }
    }
    return null;
  }

  // ── Site-specific extractors ───────────────────────────────────────────────

  function extractLinkedIn() {
    const title = firstText(
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".topcard__title",
      "h1"
    );
    const company = firstText(
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      ".topcard__flavor a"
    );
    const locationRaw = firstText(
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
      ".job-details-jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet"
    );
    const descEl = document.querySelector(
      "#job-details, .jobs-description__content, .jobs-description-content__text, .show-more-less-html__markup"
    );
    const description = descEl ? descEl.innerText.trim() : null;

    const salaryEl = firstText(
      ".job-details-jobs-unified-top-card__job-insight--highlight",
      ".compensation__salary"
    );
    const { salaryMin, salaryMax } = parseSalary(salaryEl);

    // Extract LinkedIn job ID for deduplication
    const jobIdMatch = location.href.match(/\/jobs\/view\/(\d+)/);
    const externalId = jobIdMatch ? `linkedin_${jobIdMatch[1]}` : null;

    return {
      title,
      company,
      location: locationRaw,
      description,
      salaryMin,
      salaryMax,
      remote: detectRemote(locationRaw, title, description),
      externalId,
      source: "linkedin",
      sourceUrl: window.location.href,
    };
  }

  function extractIndeed() {
    const title = firstText(
      "h1.jobsearch-JobInfoHeader-title",
      "[data-testid='jobsearch-JobInfoHeader-title']",
      "h1"
    );
    const company = firstText(
      "[data-testid='inlineHeader-companyName'] a",
      "[data-testid='inlineHeader-companyName']",
      ".jobsearch-InlineCompanyRating-companyHeader"
    );
    const locationRaw = firstText(
      "[data-testid='job-location']",
      "[data-testid='inlineHeader-companyLocation']",
      ".jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-locationWrapper"
    );
    const descEl = document.querySelector(
      "#jobDescriptionText, [data-testid='jobsearch-jobDescriptionText']"
    );
    const description = descEl ? descEl.innerText.trim() : null;

    const salaryEl = firstText(
      "#salaryInfoAndJobType span",
      "[data-testid='attribute_snippet_testid']"
    );
    const { salaryMin, salaryMax } = parseSalary(salaryEl);

    // Extract Indeed job key for deduplication
    const jkMatch = window.location.search.match(/[?&]jk=([a-f0-9]+)/i);
    const externalId = jkMatch ? `indeed_${jkMatch[1]}` : null;

    return {
      title,
      company,
      location: locationRaw,
      description,
      salaryMin,
      salaryMax,
      remote: detectRemote(locationRaw, title, description),
      externalId,
      source: "indeed",
      sourceUrl: window.location.href,
    };
  }

  function extractGlassdoor() {
    const title = firstText(
      "[data-test='job-title']",
      "h1[data-test]",
      ".job-title",
      "h1"
    );
    const company = firstText(
      "[data-test='employer-name']",
      ".employer-name",
      "[data-brandviews]"
    );
    const locationRaw = firstText(
      "[data-test='location']",
      ".location",
      "[data-test='emp-location']"
    );
    const descEl = document.querySelector(
      "[data-test='jobDescriptionContent'], .jobDescriptionContent, #JobDescriptionContainer"
    );
    const description = descEl ? descEl.innerText.trim() : null;

    const salaryEl = firstText("[data-test='salary-estimate']", ".salary-estimate");
    const { salaryMin, salaryMax } = parseSalary(salaryEl);

    // Glassdoor job listing ID
    const idMatch = window.location.pathname.match(/(?:jl|JV_IC|GD_JOB)[_-]?(\d+)/i);
    const externalId = idMatch ? `glassdoor_${idMatch[1]}` : null;

    return {
      title,
      company,
      location: locationRaw,
      description,
      salaryMin,
      salaryMax,
      remote: detectRemote(locationRaw, title, description),
      externalId,
      source: "glassdoor",
      sourceUrl: window.location.href,
    };
  }

  function extractZipRecruiter() {
    const title = firstText("h1.job_title", "h1[class*='title']", "h1");
    const company = firstText(".hiring_company_text a", ".hiring_company_text", "[class*='company']");
    const locationRaw = firstText("[class*='location']", ".location_text");
    const descEl = document.querySelector(".job_description, #job_desc, [class*='description']");
    const description = descEl ? descEl.innerText.trim() : null;
    const salaryEl = firstText("[class*='salary']", ".compensation_guesses");
    const { salaryMin, salaryMax } = parseSalary(salaryEl);
    const idMatch = window.location.pathname.match(/\/jobs\/(\d+)/);
    const externalId = idMatch ? `ziprecruiter_${idMatch[1]}` : null;

    return {
      title, company, location: locationRaw, description, salaryMin, salaryMax,
      remote: detectRemote(locationRaw, title, description),
      externalId, source: "ziprecruiter", sourceUrl: window.location.href,
    };
  }

  function extractLever() {
    const title = firstText(".posting-headline h2", "h2");
    const company = firstText(".main-header-logo img[alt]")
      ?? attr(".main-header-logo img", "alt")
      ?? document.title.split(" — ")[1]?.trim()
      ?? null;
    const locationRaw = firstText(".posting-categories .location", ".sort-by-time .location");
    const descEl = document.querySelector(".section-wrapper, .posting-description");
    const description = descEl ? descEl.innerText.trim() : null;
    const idMatch = window.location.pathname.match(/\/([0-9a-f-]{36})/i);
    const externalId = idMatch ? `lever_${idMatch[1]}` : null;

    return {
      title, company, location: locationRaw, description, salaryMin: null, salaryMax: null,
      remote: detectRemote(locationRaw, title, description),
      externalId, source: "lever", sourceUrl: window.location.href,
    };
  }

  function extractGreenhouse() {
    const title = firstText("#header h1", "h1.app-title", "h1");
    const company =
      attr('meta[property="og:site_name"]', "content")
      ?? document.title.split(" — ")[1]?.trim()
      ?? null;
    const locationRaw = firstText(".location", ".headquarters");
    const descEl = document.querySelector("#content, .job__description, #app_body");
    const description = descEl ? descEl.innerText.trim() : null;
    const idMatch = window.location.pathname.match(/\/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `greenhouse_${idMatch[1]}` : null;

    return {
      title, company, location: locationRaw, description, salaryMin: null, salaryMax: null,
      remote: detectRemote(locationRaw, title, description),
      externalId, source: "greenhouse", sourceUrl: window.location.href,
    };
  }

  function extractWorkday() {
    const title = firstText("[data-automation-id='jobPostingHeader']", "h2.css-1t339lu", "h2");
    const company =
      attr('meta[property="og:site_name"]', "content")
      ?? attr('meta[name="application-name"]', "content")
      ?? null;
    const locationRaw = firstText(
      "[data-automation-id='locations']",
      "[data-automation-id='location']"
    );
    const descEl = document.querySelector(
      "[data-automation-id='jobPostingDescription']",
    );
    const description = descEl ? descEl.innerText.trim() : null;

    return {
      title, company, location: locationRaw, description, salaryMin: null, salaryMax: null,
      remote: detectRemote(locationRaw, title, description),
      externalId: null, source: "workday", sourceUrl: window.location.href,
    };
  }

  // ── Generic fallback ───────────────────────────────────────────────────────

  function extractGeneric() {
    // 1. Try JSON-LD structured data
    const jsonLd = extractJsonLd();
    if (jsonLd?.title) {
      return {
        ...jsonLd,
        source: slugify(window.location.href),
        sourceUrl: window.location.href,
        externalId: null,
      };
    }

    // 2. Open Graph / meta tags
    const ogTitle = attr('meta[property="og:title"]', "content")
      ?? attr('meta[name="title"]', "content");
    const ogDesc = attr('meta[property="og:description"]', "content")
      ?? attr('meta[name="description"]', "content");

    // 3. Heuristic DOM scan
    const h1 = text("h1");
    const title = h1 ?? ogTitle;

    // Look for company near the title
    const companyGuess =
      text('[class*="company"]') ??
      text('[class*="employer"]') ??
      text('[class*="organization"]') ??
      attr('meta[property="og:site_name"]', "content");

    // Look for location
    const locationGuess =
      text('[class*="location"]') ??
      text('[class*="city"]') ??
      text('[itemprop="addressLocality"]');

    // Main body text
    const mainEl = document.querySelector(
      'main, article, [role="main"], [class*="description"], [class*="job-detail"], #content'
    );
    const description = mainEl
      ? mainEl.innerText.replace(/\s+/g, " ").trim().slice(0, 8000)
      : ogDesc ?? null;

    return {
      title,
      company: companyGuess,
      location: locationGuess,
      description,
      salaryMin: null,
      salaryMax: null,
      remote: detectRemote(locationGuess, title, description),
      externalId: null,
      source: slugify(window.location.href),
      sourceUrl: window.location.href,
    };
  }

  // ── Main dispatcher ────────────────────────────────────────────────────────

  function extract() {
    const host = window.location.hostname;

    if (host.includes("linkedin.com")) return extractLinkedIn();
    if (host.includes("indeed.com")) return extractIndeed();
    if (host.includes("glassdoor.com")) return extractGlassdoor();
    if (host.includes("ziprecruiter.com")) return extractZipRecruiter();
    if (host.includes("lever.co")) return extractLever();
    if (host.includes("greenhouse.io") || host.includes("boards.greenhouse.io")) return extractGreenhouse();
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) return extractWorkday();

    return extractGeneric();
  }

  // ── Message listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EXTRACT_JOB") {
      try {
        sendResponse(extract());
      } catch (err) {
        sendResponse({ error: err.message });
      }
    }
    return false;
  });
})();
