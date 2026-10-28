// Kid web-search filter and kid defaults. Checks run as Muse Spark structured calls; see PLAN.md → Web search.
export const KID_SAFETY = {
  blockedCategories: ['adult content', 'violence', 'self-harm', 'drugs and alcohol', 'gambling', 'hate', 'weapons', 'dating'],
  preferredDomains: ['kids.nationalgeographic.com', 'kids.britannica.com', 'www.nasa.gov', 'kidshealth.org'],
  blockedDomains: [] as string[],
  blockedMessage: "I can't look that up. Ask a grown-up.",
  /** G4 (CONTRACT v0.15): the kid web-search filter, step by step (PLAN.md → Web search). Meta's `web_search`
   * tool has no safe-search switch and no domain filter we can rely on (ai.developer.meta.com/docs/
   * search-grounding, Oct 28: only `user_location` and `search_context_size` are documented options), so every
   * step here is ours, run as Muse Spark structured calls (MODELS.judge) around the search. Rules may only make
   * a search MORE restricted (decidedBy `rule:*`); only a model verdict lets a query through. */
  search: {
    /** 1. Query check before searching: allowed / rephrase to something age-appropriate / blocked. */
    queryCheck: true,
    /** Deterministic backstop before the model check (decidedBy `rule:kidSearchKeyword`): a match blocks. */
    blockedKeywords: [] as string[],
    /** 2. The search: kid-friendly `preferredDomains` are named in the search prompt (no API filter exists). */
    preferDomainsInPrompt: true,
    /** 3. Answer check: rewritten for the kid's age band and checked against `blockedCategories`; citations on
     * `blockedDomains` (or that fail the check) are removed. No sources left = no answer shown. */
    answerCheck: true,
    /** A kid's answer card shows at most this many sources. */
    maxSources: 3,
    /** Age band for the rewrite when the profile has no grade (profiles.basics.grade). */
    defaultAgeBand: '8-10',
    /** Homework mode (kidControls.homeworkMode): a search that asks for a homework answer gets hints instead. */
    homeworkHints: true,
    /** Shown on a rephrased search's card above the answer. */
    rephrasedMessage: 'I looked up something close to that instead.',
  },
  defaults: {
    homeworkMode: true,
    dailyMinutes: 60,
    parentsCanReadChat: true,
    webSearch: true,
    tellsParents: { safety: true, blockedSearches: true, summary: 'weekly' },
  },
} as const;
