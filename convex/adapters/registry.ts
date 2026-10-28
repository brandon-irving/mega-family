// The one file that knows which adapter fills each model port (PLAN.md → Architecture "Rules":
// "`adapters/registry.ts` is the only file that knows which vendor fills each port"). Feature code
// (convex/agent/*, convex/talk.ts) imports `getChatModel()` / `getTranscriber()`, never an adapter directly.
//
// Selection, cheapest-safe-default first:
//   1. A test override installed via `__setChatModelForTests` / `__setTranscriberForTests` wins — this is
//      how unit tests script exact responses without any env-var dance.
//   2. `MEGA_MODEL_ADAPTER=real` selects the live Meta Model API adapters. This must be set explicitly
//      (by the live-check script, through the secrets runner) — there is no default that calls the network.
//   3. Otherwise, the Fake adapters. This is the safe default for `npx vitest run` and any other run that
//      doesn't opt in, so tests never hit the network by accident.
import { defaultFakeChatModel } from './fakeChatModel';
import { defaultFakePushSender } from './fakePushSender';
import { defaultFakeTranscriber } from './fakeTranscriber';
import { expoPushSender } from './expoPushSender';
import { logEmailSender } from './logEmailSender';
import { metaChatModel } from './metaChatModel';
import { metaTranscriber } from './metaTranscriber';
import type { ChatModel } from '../ports/chatModel';
import type { EmailSender } from '../ports/emailSender';
import type { PushSender } from '../ports/pushSender';
import type { Transcriber } from '../ports/transcriber';

let chatOverride: ChatModel | null = null;
let transcriberOverride: Transcriber | null = null;
let pushSenderOverride: PushSender | null = null;
let emailSenderOverride: EmailSender | null = null;

function wantsRealAdapters(): boolean {
  return process.env.MEGA_MODEL_ADAPTER === 'real';
}

export function getChatModel(): ChatModel {
  if (chatOverride) return chatOverride;
  return wantsRealAdapters() ? metaChatModel : defaultFakeChatModel;
}

export function getTranscriber(): Transcriber {
  if (transcriberOverride) return transcriberOverride;
  return wantsRealAdapters() ? metaTranscriber : defaultFakeTranscriber;
}

/** Push isn't a model call (no spend, no cost concern), but it's still real-world I/O (an HTTP call to
 * Expo) that unit tests must never make by accident — same `wantsRealAdapters()` flag as the model
 * adapters, since it's the one env var that means "this deployment talks to the real outside world". */
export function getPushSender(): PushSender {
  if (pushSenderOverride) return pushSenderOverride;
  return wantsRealAdapters() ? expoPushSender : defaultFakePushSender;
}

/** Test-only: install a scripted ChatModel (see `fakeChatModel.ts`'s `makeFakeChatModel`). Pass `null` to
 * clear it — tests should always clear their override in an `afterEach` so it can't leak into another test. */
export function __setChatModelForTests(model: ChatModel | null): void {
  chatOverride = model;
}

/** Test-only: install a scripted Transcriber. Pass `null` to clear it. */
export function __setTranscriberForTests(transcriber: Transcriber | null): void {
  transcriberOverride = transcriber;
}

/** Test-only: install a scripted PushSender (see `fakePushSender.ts`'s `makeFakePushSender`). Pass `null`
 * to clear it. */
export function __setPushSenderForTests(sender: PushSender | null): void {
  pushSenderOverride = sender;
}

/** Password-reset email (Screen 9 redesign). No real provider is wired yet, so even with
 * MEGA_MODEL_ADAPTER=real this is the log adapter; a provider adapter goes here when one is chosen. */
export function getEmailSender(): EmailSender {
  return emailSenderOverride ?? logEmailSender;
}

/** Test-only: install a scripted EmailSender. Pass `null` to clear it. */
export function __setEmailSenderForTests(sender: EmailSender | null): void {
  emailSenderOverride = sender;
}
