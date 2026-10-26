import { API } from '../shared/domain/api';
import { query } from './_generated/server';
import { pick } from './model/define';
import { tryViewer } from './model/viewer';

export const get = query({
  ...pick(API.me.get),
  handler: async (ctx) => tryViewer(ctx),
});
