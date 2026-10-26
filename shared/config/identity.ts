// Product identity. app.config.ts reads this; nothing else hardcodes the name, ids or scheme.
export const IDENTITY = {
  name: 'MEGA',
  expansion: 'My Everyday Guidance Agent',
  tagline: "Your family's AI assistants",
  slug: 'mega',
  scheme: 'mega',
  bundleId: 'com.megafamily.app',
  appleServicesId: 'com.megafamily.app.web',
  expoOwner: 'birving2',
  easProjectId: 'a4dba631-36e1-4b29-8697-92d47e6f3938',
} as const;
