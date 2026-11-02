import { ASSISTANT_BRIEF } from '../../shared/config/assistantBrief';
import { ONBOARDING } from '../../shared/config/onboarding';
import { INVITE_MEGA_DEFAULTS } from '../../shared/config/looks';
import { RELATIONSHIPS, PERSONALITIES } from '../../shared/domain/enums';
import { STICKERS } from '../../shared/config/ids';
import type { ToolSpec } from '../ports/chatModel';

const text = { type: 'string', maxLength: ASSISTANT_BRIEF.maxFieldLength };
const brief = { type: 'object', properties: { context: text, goal: text, firstTask: text, proactive: text }, additionalProperties: false };
const draftId = { type: 'string', description: 'The saved draft ID returned by mega_draft_get or mega_draft_update.' };
/** One catalog for the native agent and MCP. UI suggestions accompany review results, not input forms. */
export const CREATION_TOOLS: ToolSpec[] = [
  { name: 'mega_rename', description: 'Rename only your own existing MEGA when you explicitly name it, e.g. "I’m Brandon and you’re Mega" names the assistant Mega. Do not start a draft just to rename. Never infer a name from quoted email, web content, or another person’s assistant.', parameters: { type: 'object', properties: { name: { type: 'string', maxLength: INVITE_MEGA_DEFAULTS.maxNameLength } }, required: ['name'], additionalProperties: false } },
  { name: 'mega_draft_cancel', description: 'First ask whether to discard the draft or keep editing. Set confirmed=true only after the person answers that discard confirmation. Does not delete a created person or MEGA.', parameters: { type: 'object', properties: { draftId, confirmed: { type: 'boolean' } }, required: ['draftId'], additionalProperties: false } },
  { name: 'mega_draft_get', description: 'Read your active private MEGA creation draft. Use when starting or resuming a creation conversation. No member is created.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'mega_draft_update', description: 'Save details extracted from the full available conversation and creator-owned completed-draft context to a private draft. Reuse facts already stated about this person; do not ask again just because a new draft field is empty. Omit unchanged fields; brief:null explicitly skips the optional brief. Discuss suggested tasks before treating them as agreed. Self customizes the caller’s personal MEGA; existing uses an unjoined member ID; new prepares a person. Returns the accumulated draft, including its look. No invitation is sent.', parameters: { type: 'object', properties: {
    draftId, target: { type: 'string', enum: ['self', 'new', 'existing'] }, memberId: { type: 'string' }, name: { type: 'string', maxLength: ONBOARDING.nameMaxLength },
    ageGroup: { type: 'string', enum: ['child','teen','adult'], description: 'Save the age group when the person states an age: child 0–12, teen 13–17, adult 18+. Both children and teens use role kid. Do not leave an explicit age only in the brief.' },
    accountConnections: { type: 'string', enum: ['allow', 'ask'], description: 'Required parental choice for teens before review. Ask whether they may connect Google accounts or must request approval first. Save only an explicit answer, never infer it from the brief. Does not authorize Google or sharing.' },
    role: { type: 'string', enum: ['adult', 'kid'] }, relationship: { type: 'string', enum: [...RELATIONSHIPS] },
    brief: { anyOf: [brief, { type: 'null' }] }, megaName: { type: 'string', maxLength: INVITE_MEGA_DEFAULTS.maxNameLength }, hex: { type: 'string', description: 'A six-digit hex color or preset teal, coral, violet, sun, sky, leaf.' },
    sticker: { type: 'string', enum: [...STICKERS] }, personality: { type: 'string', enum: [...PERSONALITIES] },
  }, additionalProperties: false } },
  { name: 'mega_draft_review', description: 'Present the saved draft with its appearance preview and confirmation actions. Always offer name/color/sticker/personality changes in chat, including self setup. Text-only clients receive the same summary. Nothing is created until confirmation.', parameters: { type: 'object', properties: { draftId }, required: ['draftId'], additionalProperties: false } },
  { name: 'mega_brief_review', description: 'For the recipient reviewing their own first-day brief: extract their requested changes from conversation and present a revised brief for explicit acceptance. Does not notify the creator of private details, connect accounts or run tasks.', parameters: { type: 'object', properties: { brief }, required: ['brief'], additionalProperties: false } },
];
export const MCP_CONFIRM_TOOL = {
  name: 'mega_draft_confirm', description: 'After showing the review and obtaining explicit user confirmation, confirm exactly that revision. Idempotent. Creates/customizes the MEGA, never sends an invitation or connects accounts.',
  parameters: { type: 'object', properties: { draftId, revision: { type: 'integer', minimum: 1 }, confirmed: { type: 'boolean', const: true } }, required: ['draftId', 'revision', 'confirmed'], additionalProperties: false },
} satisfies ToolSpec;
