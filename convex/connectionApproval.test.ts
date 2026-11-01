/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
const modules = import.meta.glob('./**/*.ts');
async function setup() {
 const t=convexTest(schema,modules);
 const seeded=await t.mutation(internal.seed.sampleFamily,{weekOf:'2026-10-25'});
 const members=await t.run(ctx=>ctx.db.query('members').withIndex('by_family',q=>q.eq('familyId',seeded.familyId)).collect());
 const kid=members.find(m=>m.role==='kid' && m.authId)!;
 await t.run(ctx=>ctx.db.patch(kid._id,{ageGroup:'teen',birthday:undefined,connectionsApprovedBy:undefined}));
 return {t,kid,admin:t.withIdentity({subject:'sample:admin'}),teen:t.withIdentity({subject:kid.authId!})};
}
test('teen asks once; parent explicitly approves; no Google access or sharing is granted',async()=>{
 const {t,kid,admin,teen}=await setup();
 await teen.mutation(api.family.requestConnections,{});
 await teen.mutation(api.family.requestConnections,{});
 const child=await t.run(ctx=>ctx.db.get(kid._id));
 expect(child?.connectionsApprovedBy).toBeUndefined();
 expect(child?.connectionRequest?.status).toBe('pending');
 const messages=await t.run(ctx=>ctx.db.query('messages').filter(q=>q.eq(q.field('ruleBlock'),'connectionApproval')).collect());
 expect(messages.length).toBe(child!.connectionRequest!.messageIds.length);
 const parent=(await admin.query(api.me.get,{}))!;
 const message=await t.run(async ctx=>{for(const m of messages){if((await ctx.db.get(m.threadId))?.ownerId===parent.member._id)return m;}return null;});
 const args={messageId:message!._id,answer:{optionIds:['approve']},via:'text' as const};
 await admin.mutation(api.chat.answerBlock,args); await admin.mutation(api.chat.answerBlock,args);
 expect((await t.run(ctx=>ctx.db.get(kid._id)))?.connectionsApprovedBy).toBe(parent.member._id);
 expect(await t.run(ctx=>ctx.db.query('integrationSecrets').collect())).toHaveLength(0);
 expect(await t.run(ctx=>ctx.db.query('schedulingPreferences').collect())).toHaveLength(0);
});
test('child cannot request; a teen cannot answer a parent’s approval block',async()=>{
 const {t,kid,teen}=await setup();
 await t.run(ctx=>ctx.db.patch(kid._id,{ageGroup:'child'}));
 await expect(teen.mutation(api.family.requestConnections,{})).rejects.toThrow();
 await t.run(ctx=>ctx.db.patch(kid._id,{ageGroup:'teen'}));
 await teen.mutation(api.family.requestConnections,{});
 const child=await t.run(ctx=>ctx.db.get(kid._id));
 await expect(teen.mutation(api.chat.answerBlock,{messageId:child!.connectionRequest!.messageIds[0],answer:{optionIds:['approve']},via:'text'})).rejects.toThrow();
});

test('declining a previously granted Calendar scope clears its connected status',async()=>{
 const {connectGoogleProducts}=await import('./model/integrations');
 const {GOOGLE}=await import('../shared/config/google');
 const {t,kid}=await setup();
 await t.run(async ctx=>{
   const calendarId=await ctx.db.insert('integrations',{familyId:kid.familyId,memberId:kid._id,kind:'googleCalendar',status:'connected',config:{},label:'test@example.com'});
   const connected=await connectGoogleProducts(ctx,{familyId:kid.familyId,memberId:kid._id,want:['gmail','googleCalendar'],grantedScopes:[GOOGLE.scopes.gmail],email:'test@example.com',now:Date.now()});
   expect(connected.map(c=>c.product)).toEqual(['gmail']);
   expect((await ctx.db.get(calendarId))?.status).toBe('error');
 });
});
