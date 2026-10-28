/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapters_expoPushSender from "../adapters/expoPushSender.js";
import type * as adapters_fakeChatModel from "../adapters/fakeChatModel.js";
import type * as adapters_fakeDirections from "../adapters/fakeDirections.js";
import type * as adapters_fakeGeocoder from "../adapters/fakeGeocoder.js";
import type * as adapters_fakePushSender from "../adapters/fakePushSender.js";
import type * as adapters_fakeTranscriber from "../adapters/fakeTranscriber.js";
import type * as adapters_fakeWeather from "../adapters/fakeWeather.js";
import type * as adapters_fakeWebSearch from "../adapters/fakeWebSearch.js";
import type * as adapters_httpFetch from "../adapters/httpFetch.js";
import type * as adapters_logEmailSender from "../adapters/logEmailSender.js";
import type * as adapters_mapbox from "../adapters/mapbox.js";
import type * as adapters_metaChatModel from "../adapters/metaChatModel.js";
import type * as adapters_metaTranscriber from "../adapters/metaTranscriber.js";
import type * as adapters_metaWebSearch from "../adapters/metaWebSearch.js";
import type * as adapters_openMeteoNwsWeather from "../adapters/openMeteoNwsWeather.js";
import type * as adapters_registry from "../adapters/registry.js";
import type * as agent_concernClassifier from "../agent/concernClassifier.js";
import type * as agent_context from "../agent/context.js";
import type * as agent_loop from "../agent/loop.js";
import type * as agent_mentionResolver from "../agent/mentionResolver.js";
import type * as agent_toolSpecs from "../agent/toolSpecs.js";
import type * as agent_tools from "../agent/tools.js";
import type * as agent_writer from "../agent/writer.js";
import type * as auth from "../auth.js";
import type * as bucks from "../bucks.js";
import type * as calendar from "../calendar.js";
import type * as chat from "../chat.js";
import type * as chores from "../chores.js";
import type * as clashes from "../clashes.js";
import type * as clock from "../clock.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as evals from "../evals.js";
import type * as events from "../events.js";
import type * as family from "../family.js";
import type * as files from "../files.js";
import type * as gifts from "../gifts.js";
import type * as homework from "../homework.js";
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
import type * as model_authOptions from "../model/authOptions.js";
import type * as model_bucks from "../model/bucks.js";
import type * as model_chat from "../model/chat.js";
import type * as model_chores from "../model/chores.js";
import type * as model_clashes from "../model/clashes.js";
import type * as model_concernGate from "../model/concernGate.js";
import type * as model_define from "../model/define.js";
import type * as model_errors from "../model/errors.js";
import type * as model_eventWrites from "../model/eventWrites.js";
import type * as model_g4Stub from "../model/g4Stub.js";
import type * as model_gdTick from "../model/gdTick.js";
import type * as model_gifts from "../model/gifts.js";
import type * as model_home from "../model/home.js";
import type * as model_layers from "../model/layers.js";
import type * as model_learningPolicy from "../model/learningPolicy.js";
import type * as model_megaStatus from "../model/megaStatus.js";
import type * as model_memoryAccess from "../model/memoryAccess.js";
import type * as model_mentions from "../model/mentions.js";
import type * as model_modelCall from "../model/modelCall.js";
import type * as model_notificationAnswer from "../model/notificationAnswer.js";
import type * as model_notificationEffects from "../model/notificationEffects.js";
import type * as model_places from "../model/places.js";
import type * as model_practice from "../model/practice.js";
import type * as model_proactive from "../model/proactive.js";
import type * as model_proposals from "../model/proposals.js";
import type * as model_pushAnswerToken from "../model/pushAnswerToken.js";
import type * as model_random from "../model/random.js";
import type * as model_recall from "../model/recall.js";
import type * as model_requestEffects from "../model/requestEffects.js";
import type * as model_routines from "../model/routines.js";
import type * as model_scopes from "../model/scopes.js";
import type * as model_seedGd from "../model/seedGd.js";
import type * as model_sharingAccess from "../model/sharingAccess.js";
import type * as model_spend from "../model/spend.js";
import type * as model_store from "../model/store.js";
import type * as model_threads from "../model/threads.js";
import type * as model_viewer from "../model/viewer.js";
import type * as model_visibility from "../model/visibility.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as places from "../places.js";
import type * as ports_chatModel from "../ports/chatModel.js";
import type * as ports_clock from "../ports/clock.js";
import type * as ports_directions from "../ports/directions.js";
import type * as ports_emailSender from "../ports/emailSender.js";
import type * as ports_geocoder from "../ports/geocoder.js";
import type * as ports_integrationResult from "../ports/integrationResult.js";
import type * as ports_pushSender from "../ports/pushSender.js";
import type * as ports_transcriber from "../ports/transcriber.js";
import type * as ports_weather from "../ports/weather.js";
import type * as ports_webSearch from "../ports/webSearch.js";
import type * as practice from "../practice.js";
import type * as proactive from "../proactive.js";
import type * as proposals from "../proposals.js";
import type * as push from "../push.js";
import type * as pushAnswer from "../pushAnswer.js";
import type * as requests from "../requests.js";
import type * as rooms from "../rooms.js";
import type * as routines from "../routines.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as shareSuggestions from "../shareSuggestions.js";
import type * as sharing from "../sharing.js";
import type * as spend from "../spend.js";
import type * as store from "../store.js";
import type * as talk from "../talk.js";
import type * as today from "../today.js";
import type * as travel from "../travel.js";
import type * as weather from "../weather.js";
import type * as widgets from "../widgets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "adapters/expoPushSender": typeof adapters_expoPushSender;
  "adapters/fakeChatModel": typeof adapters_fakeChatModel;
  "adapters/fakeDirections": typeof adapters_fakeDirections;
  "adapters/fakeGeocoder": typeof adapters_fakeGeocoder;
  "adapters/fakePushSender": typeof adapters_fakePushSender;
  "adapters/fakeTranscriber": typeof adapters_fakeTranscriber;
  "adapters/fakeWeather": typeof adapters_fakeWeather;
  "adapters/fakeWebSearch": typeof adapters_fakeWebSearch;
  "adapters/httpFetch": typeof adapters_httpFetch;
  "adapters/logEmailSender": typeof adapters_logEmailSender;
  "adapters/mapbox": typeof adapters_mapbox;
  "adapters/metaChatModel": typeof adapters_metaChatModel;
  "adapters/metaTranscriber": typeof adapters_metaTranscriber;
  "adapters/metaWebSearch": typeof adapters_metaWebSearch;
  "adapters/openMeteoNwsWeather": typeof adapters_openMeteoNwsWeather;
  "adapters/registry": typeof adapters_registry;
  "agent/concernClassifier": typeof agent_concernClassifier;
  "agent/context": typeof agent_context;
  "agent/loop": typeof agent_loop;
  "agent/mentionResolver": typeof agent_mentionResolver;
  "agent/toolSpecs": typeof agent_toolSpecs;
  "agent/tools": typeof agent_tools;
  "agent/writer": typeof agent_writer;
  auth: typeof auth;
  bucks: typeof bucks;
  calendar: typeof calendar;
  chat: typeof chat;
  chores: typeof chores;
  clashes: typeof clashes;
  clock: typeof clock;
  crons: typeof crons;
  demo: typeof demo;
  evals: typeof evals;
  events: typeof events;
  family: typeof family;
  files: typeof files;
  gifts: typeof gifts;
  homework: typeof homework;
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
  "model/authOptions": typeof model_authOptions;
  "model/bucks": typeof model_bucks;
  "model/chat": typeof model_chat;
  "model/chores": typeof model_chores;
  "model/clashes": typeof model_clashes;
  "model/concernGate": typeof model_concernGate;
  "model/define": typeof model_define;
  "model/errors": typeof model_errors;
  "model/eventWrites": typeof model_eventWrites;
  "model/g4Stub": typeof model_g4Stub;
  "model/gdTick": typeof model_gdTick;
  "model/gifts": typeof model_gifts;
  "model/home": typeof model_home;
  "model/layers": typeof model_layers;
  "model/learningPolicy": typeof model_learningPolicy;
  "model/megaStatus": typeof model_megaStatus;
  "model/memoryAccess": typeof model_memoryAccess;
  "model/mentions": typeof model_mentions;
  "model/modelCall": typeof model_modelCall;
  "model/notificationAnswer": typeof model_notificationAnswer;
  "model/notificationEffects": typeof model_notificationEffects;
  "model/places": typeof model_places;
  "model/practice": typeof model_practice;
  "model/proactive": typeof model_proactive;
  "model/proposals": typeof model_proposals;
  "model/pushAnswerToken": typeof model_pushAnswerToken;
  "model/random": typeof model_random;
  "model/recall": typeof model_recall;
  "model/requestEffects": typeof model_requestEffects;
  "model/routines": typeof model_routines;
  "model/scopes": typeof model_scopes;
  "model/seedGd": typeof model_seedGd;
  "model/sharingAccess": typeof model_sharingAccess;
  "model/spend": typeof model_spend;
  "model/store": typeof model_store;
  "model/threads": typeof model_threads;
  "model/viewer": typeof model_viewer;
  "model/visibility": typeof model_visibility;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  places: typeof places;
  "ports/chatModel": typeof ports_chatModel;
  "ports/clock": typeof ports_clock;
  "ports/directions": typeof ports_directions;
  "ports/emailSender": typeof ports_emailSender;
  "ports/geocoder": typeof ports_geocoder;
  "ports/integrationResult": typeof ports_integrationResult;
  "ports/pushSender": typeof ports_pushSender;
  "ports/transcriber": typeof ports_transcriber;
  "ports/weather": typeof ports_weather;
  "ports/webSearch": typeof ports_webSearch;
  practice: typeof practice;
  proactive: typeof proactive;
  proposals: typeof proposals;
  push: typeof push;
  pushAnswer: typeof pushAnswer;
  requests: typeof requests;
  rooms: typeof rooms;
  routines: typeof routines;
  search: typeof search;
  seed: typeof seed;
  settings: typeof settings;
  shareSuggestions: typeof shareSuggestions;
  sharing: typeof sharing;
  spend: typeof spend;
  store: typeof store;
  talk: typeof talk;
  today: typeof today;
  travel: typeof travel;
  weather: typeof weather;
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
