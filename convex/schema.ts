// Fields come from shared/domain/tables (the contract). This file only adds indexes.
// Every index starts with familyId, except three lookups that aren't scoped by a known family:
// members.by_authId (sign-in), invites.by_tokenHash (joining), and messages.by_streamId (resolving a
// persistent-text-streaming stream id back to its message; the streamId itself is the opaque lookup key,
// and the caller's access is checked afterward, same as the other two).
// Query notes for G1:
// - grants: "grants I'm a grantee of" reads the family's grants through by_family_owner (prefix on familyId) and
//   filters granteeIds; arrays can't be indexed, and a family has only a handful of grants.
// - events: by_family_start serves range queries; calendar.range must start the scan LIMITS.maxEventHours
//   before `from` so events that began earlier but are still running are included.
import { defineSchema, defineTable } from 'convex/server';
import * as T from '../shared/domain/tables';

export default defineSchema({
  connectionSuggestions: defineTable(T.connectionSuggestions).index('by_owner_subject', ['familyId', 'ownerId', 'subjectId']).index('by_subject', ['familyId', 'subjectId']).index('by_message', ['familyId', 'messageId']),
  mailContextSuggestions: defineTable(T.mailContextSuggestions).index('by_owner', ['familyId', 'ownerId']).index('by_message', ['messageId']),
  schedulingPreferences: defineTable(T.schedulingPreferences).index('by_family_member', ['familyId', 'memberId']),
  mailPlans: defineTable(T.mailPlans).index('by_owner', ['familyId', 'ownerId']).index('by_thread', ['integrationId', 'threadId']).index('by_family', ['familyId']),
  // Identity-owned demo state, like members.by_authId, is not family-scoped.
  demoRuns: defineTable(T.demoRuns).index('by_family', ['familyId']).index('by_owner', ['ownerAuthId']).index('by_active', ['active']),
  demoProfiles: defineTable(T.demoProfiles).index('by_authId', ['authId']),
  families: defineTable(T.families),
  members: defineTable(T.members).index('by_family', ['familyId']).index('by_authId', ['authId']),
  relationships: defineTable(T.relationships).index('by_family_from', ['familyId', 'from']),
  megas: defineTable(T.megas).index('by_family_owner', ['familyId', 'ownerId']), // prefix on familyId lists a family's MEGAs
  invites: defineTable(T.invites).index('by_tokenHash', ['tokenHash']).index('by_family_member', ['familyId', 'memberId']),
  grants: defineTable(T.grants).index('by_family_owner', ['familyId', 'ownerId']),
  sharing: defineTable(T.sharing).index('by_family_member', ['familyId', 'memberId']),
  kidControls: defineTable(T.kidControls).index('by_family_member', ['familyId', 'memberId']),
  settings: defineTable(T.settings).index('by_family_member', ['familyId', 'memberId']),

  threads: defineTable(T.threads).index('by_family_owner', ['familyId', 'ownerId']),
  messages: defineTable(T.messages).index('by_family_thread_at', ['familyId', 'threadId', 'at']).index('by_streamId', ['streamId']),

  memories: defineTable(T.memories)
    .index('by_family_scopeKey', ['familyId', 'scopeKey'])
    .index('by_family_kind', ['familyId', 'kind'])
    .searchIndex('search_text', { searchField: 'text', filterFields: ['familyId', 'scopeKey'] }),
  profiles: defineTable(T.profiles).index('by_family_member', ['familyId', 'memberId']),

  events: defineTable(T.events).index('by_family_start', ['familyId', 'start']).index('by_integration_external', ['integrationId', 'externalId']),
  reminders: defineTable(T.reminders).index('by_family_member_due', ['familyId', 'forMemberId', 'dueAt']),
  lists: defineTable(T.lists).index('by_family', ['familyId']),
  listItems: defineTable(T.listItems).index('by_family_list', ['familyId', 'listId']),
  ideas: defineTable(T.ideas)
    .index('by_family_owner_at', ['familyId', 'ownerId', 'at'])
    .index('by_family_owner_source', ['familyId', 'ownerId', 'sourceKey'])
    .searchIndex('search_text', { searchField: 'searchText', filterFields: ['familyId', 'ownerId', 'category', 'saved', 'dismissed'] }),

  familyEvents: defineTable(T.familyEvents).index('by_family_at', ['familyId', 'at']),
  candidates: defineTable(T.candidates)
    .index('by_family_dedupeKey', ['familyId', 'dedupeKey'])
    .index('by_family_status', ['familyId', 'status']),
  notifications: defineTable(T.notifications).index('by_family_recipient', ['familyId', 'recipientId', 'sentAt']), // ordered by send time, held ones (no sentAt) first
  requests: defineTable(T.requests).index('by_family_to', ['familyId', 'toMemberId']).index('by_family_plan', ['familyId', 'scheduling.planId']),

  rooms: defineTable(T.rooms).index('by_family_owner', ['familyId', 'ownerId']),
  images: defineTable(T.images).index('by_family', ['familyId']),
  integrations: defineTable(T.integrations).index('by_family', ['familyId']).index('by_family_member_kind', ['familyId', 'memberId', 'kind']).index('by_kind_status', ['kind', 'status']).index('by_kind_label', ['kind', 'label']),
  usage: defineTable(T.usage).index('by_family_day', ['familyId', 'day']),
  clocks: defineTable(T.clocks).index('by_family', ['familyId']),

  // GD (CONTRACT v0.13)
  shareActions: defineTable(T.shareActions).index('by_family_owner', ['familyId', 'ownerId']),
  shareSuggestions: defineTable(T.shareSuggestions).index('by_family_owner_status', ['familyId', 'ownerId', 'status']),
  collisions: defineTable(T.collisions).index('by_family_dedupeKey', ['familyId', 'dedupeKey']).index('by_family_status', ['familyId', 'status']),
  proposals: defineTable(T.proposals).index('by_family_status', ['familyId', 'status']).index('by_family_collision', ['familyId', 'collisionId']),
  giftIdeas: defineTable(T.giftIdeas).index('by_family_for', ['familyId', 'forMemberId']).index('by_family_created', ['familyId', 'createdAt']),
  homeworkSheets: defineTable(T.homeworkSheets).index('by_family_creator', ['familyId', 'createdBy']),
  practiceSets: defineTable(T.practiceSets).index('by_family_for', ['familyId', 'forMemberId']).index('by_family_sheet', ['familyId', 'sheetId']),
  practiceAttempts: defineTable(T.practiceAttempts).index('by_family_set', ['familyId', 'setId']),
  chores: defineTable(T.chores).index('by_family_for', ['familyId', 'forMemberId']),
  choreClaims: defineTable(T.choreClaims).index('by_family_chore_date', ['familyId', 'choreId', 'date']).index('by_family_status', ['familyId', 'status']),
  routines: defineTable(T.routines).index('by_family_member_kind', ['familyId', 'memberId', 'kind']),
  routineRuns: defineTable(T.routineRuns).index('by_family_member_kind_date', ['familyId', 'memberId', 'kind', 'date']),
  bucksLedger: defineTable(T.bucksLedger).index('by_family_member_at', ['familyId', 'memberId', 'at']),
  purchases: defineTable(T.purchases).index('by_family_member', ['familyId', 'memberId']),

  // G4 (CONTRACT v0.15)
  places: defineTable(T.places).index('by_family_kind', ['familyId', 'kind']),
  weatherCache: defineTable(T.weatherCache).index('by_family_place_kind', ['familyId', 'placeId', 'kind']),
  travelChecks: defineTable(T.travelChecks).index('by_family_event_checked', ['familyId', 'eventId', 'checkedAt']),
  searchLog: defineTable(T.searchLog).index('by_family_member_at', ['familyId', 'memberId', 'at']),

  // G4b (CONTRACT v0.16)
  priceWatches: defineTable(T.priceWatches).index('by_family_status', ['familyId', 'status']).index('by_family_ideas', ['familyId', 'giftIdeasId']),
  routineSkips: defineTable(T.routineSkips).index('by_family_date', ['familyId', 'date']),
  holidays: defineTable(T.holidays).index('by_family_country_year', ['familyId', 'country', 'year']),
  // G5 (CONTRACT v0.17)
  integrationSecrets: defineTable(T.integrationSecrets).index('by_family_member_provider', ['familyId', 'memberId', 'provider']),
  oauthStates: defineTable(T.oauthStates).index('by_nonceHash', ['nonceHash']).index('by_family_member', ['familyId', 'memberId']),
  mailItems: defineTable(T.mailItems).index('by_family_member_found', ['familyId', 'memberId', 'foundAt']).index('by_integration_message', ['integrationId', 'gmailMessageId']),
  megaDrafts: defineTable(T.megaDrafts).index('by_family_creator', ['familyId', 'creatorId']),
  assistantBriefs: defineTable(T.assistantBriefs).index('by_family_member', ['familyId', 'memberId']),
  onboarding: defineTable(T.onboarding).index('by_family_member', ['familyId', 'memberId']),
  profilerRuns: defineTable(T.profilerRuns).index('by_family_member_day', ['familyId', 'memberId', 'day']),
});
