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

  function inferJobType(...values) {
    const raw = values.filter(Boolean).join(" ").toLowerCase();
    if (!raw) return null;
    if (/(full[\s-]?time|permanent)/i.test(raw)) return "full-time";
    if (/(part[\s-]?time)/i.test(raw)) return "part-time";
    if (/(contract|contractor|consultant|temporary|temp|1099)/i.test(raw)) return "contract";
    if (/(intern|internship|apprentice)/i.test(raw)) return "internship";
    if (/(freelance|gig|project[- ]based)/i.test(raw)) return "freelance";
    return null;
  }

  function inferPaymentType(...values) {
    const raw = values.filter(Boolean).join(" ").toLowerCase();
    if (!raw) return null;
    if (/\bper hour\b|\/hr\b|\/hour\b|\bhourly\b/.test(raw)) return "hourly";
    if (/\bper day\b|\/day\b|\bdaily\b/.test(raw)) return "daily";
    if (/\bper week\b|\/week\b|\bweekly\b/.test(raw)) return "weekly";
    if (/\bper month\b|\/month\b|\bmonthly\b/.test(raw)) return "monthly";
    if (/\bper year\b|\/year\b|\byearly\b|\bannual\b|\bannually\b/.test(raw)) return "yearly";
    if (/\bper project\b|\bproject[- ]based\b/.test(raw)) return "project";
    return null;
  }

  function inferWorkArrangement(location, title, description) {
    const raw = `${location ?? ""} ${title ?? ""} ${description ?? ""}`.toLowerCase();
    if (!raw.trim()) return null;
    if (/\bhybrid\b/.test(raw)) return "hybrid";
    if (/\bremote\b|\bwork from home\b|\bwfh\b|\btelecommute\b|\btelework\b/.test(raw)) return "remote";
    if (/\bonsite\b|\bon-site\b|\bin office\b|\bin-office\b/.test(raw)) return "onsite";
    return null;
  }

  function inferContractFlag(jobType, ...values) {
    const raw = [jobType, ...values].filter(Boolean).join(" ").toLowerCase();
    if (!raw) return null;
    if (/\bcontract\b|\bcontractor\b|\bconsultant\b|\btemporary\b|\btemp\b|\b1099\b|\bfreelance\b/.test(raw)) return true;
    if (/\bfull[\s-]?time\b|\bpart[\s-]?time\b|\bpermanent\b|\bw2\b|\binternship\b/.test(raw)) return false;
    return null;
  }

  function buildJobMeta({
    title,
    company,
    location,
    description,
    remote,
    salaryMin,
    salaryMax,
    salaryText,
    jobType,
    companyAddress,
    workLocation,
  }) {
    const normalizedJobType = jobType ?? inferJobType(title, description, salaryText, location);
    const workArrangement = remote ? "remote" : (inferWorkArrangement(location, title, description) ?? "onsite");
    const paymentType = inferPaymentType(salaryText, description, normalizedJobType);
    const compensationText =
      salaryText ||
      ((salaryMin || salaryMax)
        ? [salaryMin ? `$${salaryMin}` : null, salaryMax ? `$${salaryMax}` : null].filter(Boolean).join(" - ")
        : null);

    return {
      jobMeta: {
        title,
        company,
        workLocation: workLocation ?? location ?? null,
        companyAddress: companyAddress ?? location ?? null,
        workArrangement,
        paymentType,
        compensationText,
        isContract: inferContractFlag(normalizedJobType, title, description, salaryText),
        employmentType: normalizedJobType,
        salaryMin: salaryMin ?? null,
        salaryMax: salaryMax ?? null,
        remote: Boolean(remote),
      },
    };
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

        const employmentType = Array.isArray(posting.employmentType) ? posting.employmentType[0] : posting.employmentType;
        const companyAddress = posting.jobLocation?.address
          ? [
              posting.jobLocation.address.streetAddress,
              posting.jobLocation.address.addressLocality,
              posting.jobLocation.address.addressRegion,
              posting.jobLocation.address.postalCode,
              posting.jobLocation.address.addressCountry,
            ].filter(Boolean).join(", ")
          : location;

        return {
          title,
          company,
          location,
          description,
          remote,
          salaryMin,
          salaryMax,
          jobType: inferJobType(employmentType, description, title),
          rawData: buildJobMeta({
            title,
            company,
            location,
            description,
            remote,
            salaryMin,
            salaryMax,
            salaryText: typeof posting.baseSalary === "string" ? posting.baseSalary : null,
            jobType: inferJobType(employmentType, description, title),
            companyAddress,
          }),
        };
      } catch { /* continue */ }
    }
    return null;
  }

  // ── Site-specific extractors ───────────────────────────────────────────────

  function extractLinkedIn() {
    // Auto-expand "See more" so the full description is in the DOM / innerText
    document.querySelectorAll(
      ".show-more-less-html__button--more, button.show-more-less-html__button"
    ).forEach((btn) => {
      try { btn.click(); } catch (_) { /* ignore */ }
    });

    // Helper: get text using textContent so CSS-clipped/overflow-hidden text is included
    function descText(sel) {
      const el = document.querySelector(sel);
      return el ? (el.textContent || "").replace(/\s+/g, " ").trim() || null : null;
    }

    // Helper: first non-empty match using class-contains selector (resilient to hashed suffixes)
    function firstContains(...fragments) {
      for (const frag of fragments) {
        const el = document.querySelector(`[class*="${frag}"]`);
        const t = el ? el.innerText.trim() : null;
        if (t) return t;
      }
      return null;
    }

    const title =
      firstText(
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title",
        ".topcard__title",
        "h1.t-24",
        "h1[class*='t-24']"
      ) ??
      firstContains("unified-top-card__job-title", "top-card__title") ??
      text("h1");

    const company =
      firstText(
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        ".topcard__flavor a"
      ) ??
      firstContains("unified-top-card__company-name", "top-card__org-name");

    const locationRaw =
      firstText(
        ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
        ".job-details-jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__workplace-type",
        ".topcard__flavor--bullet"
      ) ??
      firstContains("unified-top-card__bullet", "top-card__flavor--bullet");

    // Use textContent on the most-specific description container first.
    // textContent captures overflow-hidden/max-height-clipped text that innerText misses.
    const description =
      descText(".show-more-less-html__markup") ??
      descText(".jobs-description-content__text--stretch") ??
      descText(".jobs-description-content__text") ??
      descText("[class*='jobs-description-content__text']") ??
      descText(".jobs-description__content") ??
      descText("[class*='jobs-description__content']") ??
      descText("#job-details");

    const salaryEl =
      firstText(
        ".job-details-jobs-unified-top-card__job-insight--highlight",
        ".jobs-unified-top-card__job-insight--highlight",
        ".compensation__salary",
        ".salary"
      ) ??
      firstContains("job-insight--highlight", "compensation__salary");
    const { salaryMin, salaryMax } = parseSalary(salaryEl);
    const insightText = [...document.querySelectorAll(".job-details-jobs-unified-top-card__job-insight, .job-details-jobs-unified-top-card__job-insight--highlight, .jobs-unified-top-card__job-insight")]
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const jobType = inferJobType(insightText, title, description, salaryEl);

    // Extract LinkedIn job ID for deduplication
    const jobIdMatch = location.href.match(/\/jobs\/view\/(\d+)/);
    const externalId = jobIdMatch ? `linkedin_${jobIdMatch[1]}` : null;

    return {
      title,
      company,
      location: locationRaw,
      description,
      jobType,
      salaryMin,
      salaryMax,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin,
        salaryMax,
        salaryText: salaryEl,
        jobType,
      }),
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
    const jobType = inferJobType(salaryEl, title, description);

    // Extract Indeed job key for deduplication
    const jkMatch = window.location.search.match(/[?&]jk=([a-f0-9]+)/i);
    const externalId = jkMatch ? `indeed_${jkMatch[1]}` : null;

    return {
      title,
      company,
      location: locationRaw,
      description,
      jobType,
      salaryMin,
      salaryMax,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin,
        salaryMax,
        salaryText: salaryEl,
        jobType,
      }),
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
    const detailText = [...document.querySelectorAll("[data-test='detail-item'], .job-search-keyword-pill")]
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const jobType = inferJobType(detailText, salaryEl, title, description);

    // Glassdoor job listing ID
    const idMatch = window.location.pathname.match(/(?:jl|JV_IC|GD_JOB)[_-]?(\d+)/i);
    const externalId = idMatch ? `glassdoor_${idMatch[1]}` : null;

    return {
      title,
      company,
      location: locationRaw,
      description,
      jobType,
      salaryMin,
      salaryMax,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin,
        salaryMax,
        salaryText: salaryEl,
        jobType,
      }),
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
    const jobType = inferJobType(salaryEl, title, description);
    const idMatch = window.location.pathname.match(/\/jobs\/(\d+)/);
    const externalId = idMatch ? `ziprecruiter_${idMatch[1]}` : null;

    return {
      title, company, location: locationRaw, description, jobType, salaryMin, salaryMax,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin,
        salaryMax,
        salaryText: salaryEl,
        jobType,
      }),
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
    const categoriesText = firstText(".posting-categories", ".posting-categories .sort-by-time");
    const jobType = inferJobType(categoriesText, title, description);

    return {
      title, company, location: locationRaw, description, jobType, salaryMin: null, salaryMax: null,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin: null,
        salaryMax: null,
        salaryText: null,
        jobType,
      }),
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
    const metaText = firstText(".job__meta", ".header");
    const jobType = inferJobType(metaText, title, description);

    return {
      title, company, location: locationRaw, description, jobType, salaryMin: null, salaryMax: null,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin: null,
        salaryMax: null,
        salaryText: null,
        jobType,
      }),
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
    const detailsText = firstText("[data-automation-id='job-details']", "[data-automation-id='jobPostingDescription']");
    const jobType = inferJobType(detailsText, title, description);

    return {
      title, company, location: locationRaw, description, jobType, salaryMin: null, salaryMax: null,
      remote: detectRemote(locationRaw, title, description),
      rawData: buildJobMeta({
        title,
        company,
        location: locationRaw,
        description,
        remote: detectRemote(locationRaw, title, description),
        salaryMin: null,
        salaryMax: null,
        salaryText: null,
        jobType,
      }),
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
      jobType: inferJobType(title, description, locationGuess),
      salaryMin: null,
      salaryMax: null,
      remote: detectRemote(locationGuess, title, description),
      rawData: buildJobMeta({
        title,
        company: companyGuess,
        location: locationGuess,
        description,
        remote: detectRemote(locationGuess, title, description),
        salaryMin: null,
        salaryMax: null,
        salaryText: null,
        jobType: inferJobType(title, description, locationGuess),
      }),
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
