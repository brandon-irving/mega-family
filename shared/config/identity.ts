// Product identity. app.config.ts reads this; nothing else hardcodes the name, ids or scheme.
export const IDENTITY = {
  name: 'MEGA',
  expansion: 'My Everyday Guidance Agent',
  // Owner, Oct 27: the one tagline on any sign-in screen (Screen 9 boards).
  tagline: 'A little help for the whole family',
  slug: 'mega',
  scheme: 'mega',
  bundleId: 'com.megafamily.app',
  appleServicesId: 'com.megafamily.app.web',
  expoOwner: 'birving2',
  easProjectId: 'a4dba631-36e1-4b29-8697-92d47e6f3938',
} as const;
