// Kid web-search filter and kid defaults. Checks run as Muse Spark structured calls; see PLAN.md → Web search.
export const KID_SAFETY = {
  blockedCategories: ['adult content', 'violence', 'self-harm', 'drugs and alcohol', 'gambling', 'hate', 'weapons', 'dating'],
  preferredDomains: ['kids.nationalgeographic.com', 'kids.britannica.com', 'www.nasa.gov', 'kidshealth.org'],
  blockedDomains: [] as string[],
  blockedMessage: "I can't look that up. Ask a grown-up.",
  defaults: {
    homeworkMode: true,
    dailyMinutes: 60,
    parentsCanReadChat: true,
    webSearch: true,
    tellsParents: { safety: true, blockedSearches: true, summary: 'weekly' },
  },
} as const;
