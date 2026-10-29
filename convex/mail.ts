// CONTRACT §4 `mail.*` (G5, v0.17): what MEGA found in Gmail (owner only). Stub until the G5 backend: see
// docs/gates/G5.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { notBuiltYet } from './model/g5Stub';
import { requireViewer } from './model/viewer';

export const items = query({
  ...pick(API.mail.items),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return []; // stub
  },
});

export const dismiss = mutation({
  ...pick(API.mail.dismiss),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('mail.dismiss');
  },
});
