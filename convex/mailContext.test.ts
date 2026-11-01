/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { validateLocation } from './model/mailExtract';
const modules = import.meta.glob('./**/*.ts');

test('location clue must have a literal owner-specific excerpt, not just an event venue',()=>{
 const evidence='We are planning publicity around Orlando, Florida, where you mentioned you are based.';
 expect(validateLocation({location:{city:'Orlando',region:'Florida',evidence}},evidence)).toBe('Orlando, Florida');
 expect(validateLocation({location:{city:'Orlando',region:'Florida',evidence}},'Meeting is in Orlando, Florida.')).toBeUndefined();
 const venue='The venue is in Orlando, Florida.';
 expect(validateLocation({location:{city:'Orlando',region:'Florida',evidence:venue}},venue)).toBeUndefined();
});
test.each(['save','no','skip'])('email location remains out of memory until explicit save (%s)',async choice=>{
 const t=convexTest(schema,modules);
 const seeded=await t.mutation(internal.seed.sampleFamily,{weekOf:'2026-10-25'});
 const owner=t.withIdentity({subject:'sample:admin'});
 const integrationId=await t.run(async ctx=>{
  await ctx.db.insert('schedulingPreferences',{familyId:seeded.familyId,memberId:seeded.members.admin,enabled:true,autoCapture:false,availabilityFor:[]});
  return ctx.db.insert('integrations',{familyId:seeded.familyId,memberId:seeded.members.admin,kind:'gmail',config:{},status:'connected'});
 });
 const before=await t.run(ctx=>ctx.db.query('memories').collect());
 const args={integrationId,sourceMessageId:'location-mail',location:'Orlando, Florida'};
 await t.mutation(internal.mailContext.suggest,args); await t.mutation(internal.mailContext.suggest,args);
 const suggestions=await t.run(ctx=>ctx.db.query('mailContextSuggestions').collect());
 expect(suggestions).toHaveLength(1);
 expect(await t.run(ctx=>ctx.db.query('memories').collect())).toHaveLength(before.length);
 const answer={messageId:suggestions[0].messageId!,answer:{optionIds:[choice]},via:'text' as const};
 await expect(t.withIdentity({subject:'sample:partner'}).mutation(api.chat.answerBlock,answer)).rejects.toThrow();
 await owner.mutation(api.chat.answerBlock,answer); await owner.mutation(api.chat.answerBlock,answer);
 const after=await t.run(ctx=>ctx.db.query('memories').collect());
 expect(after).toHaveLength(before.length+(choice==='save'?1:0));
 if(choice==='save') expect(after.find(m=>m.text.includes('based in Orlando'))).toMatchObject({scope:'personal',confirmed:true,sensitive:true,about:[seeded.members.admin]});
});
