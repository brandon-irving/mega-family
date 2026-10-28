// Kid web-search filter and kid defaults. Checks run as Muse Spark structured calls; see PLAN.md → Web search.
export const KID_SAFETY = {
  blockedCategories: ['adult content', 'violence', 'self-harm', 'drugs and alcohol', 'gambling', 'hate', 'weapons', 'dating'],
  preferredDomains: ['kids.nationalgeographic.com', 'kids.britannica.com', 'www.nasa.gov', 'kidshealth.org'],
  /** Sites a kid's search card never links to (a host or any subdomain of it). A starter list for the owner to
   * tune; the answer check also screens each source's title and domain (G4 review, Oct 28), so this is the
   * deterministic floor, not the whole filter. */
  blockedDomains: [
    // adult
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'onlyfans.com', 'chaturbate.com', 'literotica.com',
    // gambling
    'draftkings.com', 'fanduel.com', 'bet365.com', 'pokerstars.com', 'stake.com', 'betmgm.com',
    // gore and shock
    'bestgore.fun', 'kaotic.com', 'theync.com', 'liveleak.com', 'goregrish.com',
    // piracy
    'thepiratebay.org', '1337x.to', 'rarbg.to', 'fmovies.to', 'yts.mx',
    // anonymous chat with strangers, dating
    'omegle.com', 'ome.tv', 'chatroulette.com', 'emeraldchat.com', 'tinder.com', 'bumble.com',
    // anonymous boards
    '4chan.org', '4channel.org', '8kun.top',
  ] as string[],
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
    blockedKeywords: ['porn', 'nude', 'naked', 'sex', 'suicide', 'kill myself', 'self harm', 'how to make a bomb', 'buy a gun', 'drugs', 'vape', 'gambling', 'casino', 'beheading', 'gore'] as string[],
    /** 2. The search: kid-friendly `preferredDomains` are named in the search prompt (no API filter exists). */
    preferDomainsInPrompt: true,
    /** 3. Answer check: rewritten for the kid's age band and checked against `blockedCategories`. Sources are
     * screened too: on `blockedDomains`, a `blockedKeywords` match in the title, or flagged by the answer check
     * (it sees each source's title and domain) → removed. No sources left = no answer shown (rules only tighten). */
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
