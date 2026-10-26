/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapters_fakeChatModel from "../adapters/fakeChatModel.js";
import type * as adapters_fakeTranscriber from "../adapters/fakeTranscriber.js";
import type * as adapters_metaChatModel from "../adapters/metaChatModel.js";
import type * as adapters_metaTranscriber from "../adapters/metaTranscriber.js";
import type * as adapters_registry from "../adapters/registry.js";
import type * as agent_concernClassifier from "../agent/concernClassifier.js";
import type * as agent_context from "../agent/context.js";
import type * as agent_loop from "../agent/loop.js";
import type * as agent_mentionResolver from "../agent/mentionResolver.js";
import type * as agent_toolSpecs from "../agent/toolSpecs.js";
import type * as agent_tools from "../agent/tools.js";
import type * as agent_writer from "../agent/writer.js";
import type * as auth from "../auth.js";
import type * as calendar from "../calendar.js";
import type * as chat from "../chat.js";
import type * as clock from "../clock.js";
import type * as demo from "../demo.js";
import type * as events from "../events.js";
import type * as family from "../family.js";
import type * as files from "../files.js";
import type * as hq from "../hq.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as invites from "../invites.js";
import type * as kidControls from "../kidControls.js";
import type * as lists from "../lists.js";
import type * as me from "../me.js";
import type * as megas from "../megas.js";
import type * as memories from "../memories.js";
import type * as model_applyLearning from "../model/applyLearning.js";
import type * as model_audioFormat from "../model/audioFormat.js";
import type * as model_chat from "../model/chat.js";
import type * as model_concernGate from "../model/concernGate.js";
import type * as model_define from "../model/define.js";
import type * as model_errors from "../model/errors.js";
import type * as model_home from "../model/home.js";
import type * as model_learningPolicy from "../model/learningPolicy.js";
import type * as model_megaStatus from "../model/megaStatus.js";
import type * as model_memoryAccess from "../model/memoryAccess.js";
import type * as model_mentions from "../model/mentions.js";
import type * as model_random from "../model/random.js";
import type * as model_recall from "../model/recall.js";
import type * as model_scopes from "../model/scopes.js";
import type * as model_sharingAccess from "../model/sharingAccess.js";
import type * as model_spend from "../model/spend.js";
import type * as model_threads from "../model/threads.js";
import type * as model_viewer from "../model/viewer.js";
import type * as model_visibility from "../model/visibility.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as ports_chatModel from "../ports/chatModel.js";
import type * as ports_clock from "../ports/clock.js";
import type * as ports_transcriber from "../ports/transcriber.js";
import type * as push from "../push.js";
import type * as requests from "../requests.js";
import type * as rooms from "../rooms.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as sharing from "../sharing.js";
import type * as spend from "../spend.js";
import type * as talk from "../talk.js";
import type * as today from "../today.js";
import type * as widgets from "../widgets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "adapters/fakeChatModel": typeof adapters_fakeChatModel;
  "adapters/fakeTranscriber": typeof adapters_fakeTranscriber;
  "adapters/metaChatModel": typeof adapters_metaChatModel;
  "adapters/metaTranscriber": typeof adapters_metaTranscriber;
  "adapters/registry": typeof adapters_registry;
  "agent/concernClassifier": typeof agent_concernClassifier;
  "agent/context": typeof agent_context;
  "agent/loop": typeof agent_loop;
  "agent/mentionResolver": typeof agent_mentionResolver;
  "agent/toolSpecs": typeof agent_toolSpecs;
  "agent/tools": typeof agent_tools;
  "agent/writer": typeof agent_writer;
  auth: typeof auth;
  calendar: typeof calendar;
  chat: typeof chat;
  clock: typeof clock;
  demo: typeof demo;
  events: typeof events;
  family: typeof family;
  files: typeof files;
  hq: typeof hq;
  http: typeof http;
  images: typeof images;
  invites: typeof invites;
  kidControls: typeof kidControls;
  lists: typeof lists;
  me: typeof me;
  megas: typeof megas;
  memories: typeof memories;
  "model/applyLearning": typeof model_applyLearning;
  "model/audioFormat": typeof model_audioFormat;
  "model/chat": typeof model_chat;
  "model/concernGate": typeof model_concernGate;
  "model/define": typeof model_define;
  "model/errors": typeof model_errors;
  "model/home": typeof model_home;
  "model/learningPolicy": typeof model_learningPolicy;
  "model/megaStatus": typeof model_megaStatus;
  "model/memoryAccess": typeof model_memoryAccess;
  "model/mentions": typeof model_mentions;
  "model/random": typeof model_random;
  "model/recall": typeof model_recall;
  "model/scopes": typeof model_scopes;
  "model/sharingAccess": typeof model_sharingAccess;
  "model/spend": typeof model_spend;
  "model/threads": typeof model_threads;
  "model/viewer": typeof model_viewer;
  "model/visibility": typeof model_visibility;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  "ports/chatModel": typeof ports_chatModel;
  "ports/clock": typeof ports_clock;
  "ports/transcriber": typeof ports_transcriber;
  push: typeof push;
  requests: typeof requests;
  rooms: typeof rooms;
  seed: typeof seed;
  settings: typeof settings;
  sharing: typeof sharing;
  spend: typeof spend;
  talk: typeof talk;
  today: typeof today;
  widgets: typeof widgets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  persistentTextStreaming: import("@convex-dev/persistent-text-streaming/_generated/component.js").ComponentApi<"persistentTextStreaming">;
};
