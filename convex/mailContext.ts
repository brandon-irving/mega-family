import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { suggestMailLocation } from './model/mailContext';
export const suggest = internalMutation({ args: { integrationId: v.id('integrations'), sourceMessageId: v.string(), location: v.string() }, handler: suggestMailLocation });
