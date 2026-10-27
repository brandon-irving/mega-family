// JSON-schema tool specs the ChatModel sees, plus which `shared/config/roles.ts` `Tool` and runtime
// permission each maps to. PLAN.md → Chat tools: "Which tools each level gets is config" (ROLES_CONFIG) —
// this file is where that config becomes the concrete, implemented function names the model can call.
// web_search / weather / travel_time / make_image are G4+ (PLAN.md schedule): they're registered here (so
// turning one on later is a one-line `implemented: true`) but never included in a tools list sent to the
// model yet — "register them as unavailable" (task brief).
import { MEMORY_KINDS, SCOPES } from '../../shared/domain/enums';
import { ROLES_CONFIG, type Tool } from '../../shared/config/roles';
import type { Role } from '../../shared/domain/enums';
import type { ToolSpec } from '../ports/chatModel';

export const AGENT_TOOL_NAMES = [
  'recall',
  'remember',
  'events_create',
  'events_update',
  'events_cancel',
  'reminders_create',
  'lists_add',
  'lists_check',
  'lists_remove',
  'ask_member',
  'show_ui',
  'follow_up',
  'web_search',
  'weather',
  'travel_time',
  'make_image',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

interface ToolDef {
  spec: ToolSpec;
  /** Which `shared/config/roles.ts` tool id gates this (several concrete tools share one config id, e.g.
   * `events_create`/`.update`/`.cancel` are all gated by the config id `"events"`). */
  configTool: Tool;
  implemented: boolean;
}

const jsonBool = { type: 'boolean' } as const;
const jsonStr = { type: 'string' } as const;
const jsonNum = { type: 'number' } as const;
const jsonStrArray = { type: 'array', items: jsonStr } as const;
// Model-facing time args are local wall-clock strings, not epoch ms (a model computes ms badly) — the
// family's own timezone (shared/time.ts zonedInstant), converted server-side in convex/agent/tools.ts.
const jsonLocalDateTime = { type: 'string', description: 'Local date-time in the family\'s own timezone, as "YYYY-MM-DDTHH:MM" (24-hour). Never epoch ms, never UTC, never a "Z" suffix.' } as const;
const jsonAllDay = { type: 'string', description: 'All-day date as "YYYY-MM-DD", in the family\'s timezone.' } as const;

export const AGENT_TOOLS: Record<AgentToolName, ToolDef> = {
  recall: {
    configTool: 'recall',
    implemented: true,
    spec: {
      name: 'recall',
      description: "Search the family's memory for something relevant that isn't already in your context. Only returns what you're allowed to read.",
      parameters: { type: 'object', properties: { query: jsonStr }, required: ['query'], additionalProperties: false },
    },
  },
  remember: {
    configTool: 'remember',
    implemented: true,
    spec: {
      name: 'remember',
      description: 'Save a fact the member explicitly asked you to remember, or a correction to one you already know.',
      parameters: {
        type: 'object',
        properties: {
          text: jsonStr,
          kind: { type: 'string', enum: [...MEMORY_KINDS] },
          scope: { type: 'string', enum: [...SCOPES] },
          shareWithMemberIds: jsonStrArray,
          about: jsonStrArray,
          sensitive: jsonBool,
          supersedesMemoryId: jsonStr,
        },
        required: ['text', 'kind', 'scope'],
        additionalProperties: false,
      },
    },
  },
  events_create: {
    configTool: 'events',
    implemented: true,
    spec: {
      name: 'events_create',
      description: 'Add an event to the family calendar.',
      parameters: {
        type: 'object',
        properties: { title: jsonStr, start: jsonLocalDateTime, end: jsonLocalDateTime, allDay: jsonAllDay, who: jsonStrArray, place: jsonStr, scope: { type: 'string', enum: [...SCOPES] } },
        required: ['title', 'start', 'who', 'scope'],
        additionalProperties: false,
      },
    },
  },
  events_update: {
    configTool: 'events',
    implemented: true,
    spec: {
      name: 'events_update',
      description: 'Change an existing event.',
      parameters: {
        type: 'object',
        properties: { eventId: jsonStr, title: jsonStr, start: jsonLocalDateTime, end: jsonLocalDateTime, who: jsonStrArray, place: jsonStr },
        required: ['eventId'],
        additionalProperties: false,
      },
    },
  },
  events_cancel: {
    configTool: 'events',
    implemented: true,
    spec: { name: 'events_cancel', description: 'Cancel an event.', parameters: { type: 'object', properties: { eventId: jsonStr }, required: ['eventId'], additionalProperties: false } },
  },
  reminders_create: {
    configTool: 'reminders',
    implemented: true,
    spec: {
      name: 'reminders_create',
      description: 'Set a reminder for a family member at a specific time.',
      parameters: {
        type: 'object',
        properties: { forMemberId: jsonStr, text: jsonStr, dueAt: jsonLocalDateTime, eventId: jsonStr },
        required: ['forMemberId', 'text', 'dueAt'],
        additionalProperties: false,
      },
    },
  },
  lists_add: {
    configTool: 'lists',
    implemented: true,
    spec: {
      name: 'lists_add',
      description: 'Add an item to a family list (e.g. Groceries). Creates the list if it does not exist yet.',
      parameters: { type: 'object', properties: { listName: jsonStr, text: jsonStr }, required: ['listName', 'text'], additionalProperties: false },
    },
  },
  lists_check: {
    configTool: 'lists',
    implemented: true,
    spec: {
      name: 'lists_check',
      description: 'Check or uncheck a list item by its text.',
      parameters: { type: 'object', properties: { listName: jsonStr, itemText: jsonStr, checked: jsonBool }, required: ['listName', 'itemText', 'checked'], additionalProperties: false },
    },
  },
  lists_remove: {
    configTool: 'lists',
    implemented: true,
    spec: {
      name: 'lists_remove',
      description: 'Remove an item from a list by its text.',
      parameters: { type: 'object', properties: { listName: jsonStr, itemText: jsonStr }, required: ['listName', 'itemText'], additionalProperties: false },
    },
  },
  ask_member: {
    configTool: 'ask_member',
    implemented: true,
    spec: {
      name: 'ask_member',
      description:
        "Send a request to another family member's MEGA — it shows as a card in their chat and a push notification with Yes/No buttons. Optionally set onAccept so saying \"yes\" automatically does something (for now, only adding an item to a list) instead of just recording a yes.",
      parameters: {
        type: 'object',
        properties: {
          toMemberId: jsonStr,
          text: jsonStr,
          onAccept: {
            type: 'object',
            description: 'What "yes" should automatically do. Only set this when the request is literally asking them to add something to a list.',
            properties: { tool: { type: 'string', enum: ['lists_add'] }, listName: jsonStr, text: jsonStr },
            required: ['tool', 'listName', 'text'],
            additionalProperties: false,
          },
        },
        required: ['toMemberId', 'text'],
        additionalProperties: false,
      },
    },
  },
  show_ui: {
    configTool: 'show_ui',
    implemented: true,
    spec: {
      name: 'show_ui',
      description: 'Show a small interactive piece of UI in the thread instead of asking in plain text (a choice, a toggle, a date picker, etc).',
      parameters: { type: 'object', properties: { block: { type: 'object' } }, required: ['block'], additionalProperties: false },
    },
  },
  follow_up: {
    configTool: 'follow_up',
    implemented: true,
    spec: {
      name: 'follow_up',
      description: 'Schedule a check-back with the member after some time has passed.',
      parameters: { type: 'object', properties: { text: jsonStr, afterMinutes: jsonNum }, required: ['text', 'afterMinutes'], additionalProperties: false },
    },
  },
  web_search: {
    configTool: 'web_search',
    implemented: false, // G4 (PLAN.md schedule) — kid filter not built yet
    spec: { name: 'web_search', description: 'Not available yet.', parameters: { type: 'object', properties: { query: jsonStr }, required: ['query'], additionalProperties: false } },
  },
  weather: {
    configTool: 'weather',
    implemented: false, // G4
    spec: { name: 'weather', description: 'Not available yet.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  },
  travel_time: {
    configTool: 'travel_time',
    implemented: false, // G4
    spec: { name: 'travel_time', description: 'Not available yet.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  },
  make_image: {
    configTool: 'make_image',
    implemented: false, // G6+ (rooms/posters)
    spec: { name: 'make_image', description: 'Not available yet.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  },
};

/** The tool specs to actually offer the model for this role: implemented tools whose config id is in
 * `ROLES_CONFIG[role].tools`. This is the first line of defense; `agent/tools.ts`'s dispatcher re-checks
 * the same gate server-side so a model that calls an unoffered tool anyway still gets refused. */
export function toolsForRole(role: Role): ToolSpec[] {
  const allowed = new Set<Tool>(ROLES_CONFIG[role].tools);
  return Object.values(AGENT_TOOLS)
    .filter((t) => t.implemented && allowed.has(t.configTool))
    .map((t) => t.spec);
}

export function isToolAllowedForRole(name: string, role: Role): boolean {
  const def = (AGENT_TOOLS as Record<string, ToolDef | undefined>)[name];
  if (!def || !def.implemented) return false;
  return new Set<Tool>(ROLES_CONFIG[role].tools).has(def.configTool);
}
