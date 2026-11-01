/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { register as registerStreaming } from '@convex-dev/persistent-text-streaming/test';
import { afterEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { DEMO_SCENARIO as C } from '../shared/config/demo';
import { demoEmail, demoDate } from '../shared/demoScenario';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.unstubAllEnvs());
async function setup() {
 vi.stubEnv('DEMO_MODE','true'); const t=convexTest(schema,modules); registerStreaming(t);
 const seeded=await t.mutation(internal.seed.sampleFamily, {weekOf:'2026-10-25'}); const admin=t.withIdentity({subject:'sample:admin'});
 await admin.mutation(api.demoConsole.start,{expectedMemberId:seeded.members.admin});
 const viewer=(await admin.query(api.me.get,{}))!; const run=(await admin.query(api.demoConsole.state,{}))!;
 await t.run(async ctx => { await ctx.db.patch(viewer.member._id,{name:'Brandon'}); await ctx.db.insert('integrations',{familyId:viewer.family._id,memberId:viewer.member._id,kind:'gmail',config:{},status:'connected',label:C.personas[0].email}); await ctx.db.insert('schedulingPreferences',{familyId:viewer.family._id,memberId:viewer.member._id,enabled:true,autoCapture:true,availabilityFor:[]}); });
 return {t,admin,seeded,viewer,run};
}
test('isolated reset, prepared teen family, owner-only controls and deterministic config',async()=>{
 const {t,admin,seeded,viewer,run}=await setup();
 await admin.mutation(api.demoConsole.prepare,{runId:run.runId}); await admin.mutation(api.demoConsole.prepare,{runId:run.runId});
 const people=(await admin.query(api.demoConsole.state,{}))!.personas; expect(people).toHaveLength(3); expect(people.every(p=>p.memberId)).toBe(true);
 const maya=await t.run(ctx=>ctx.db.get(people[2].memberId!)); expect(maya?.role).toBe('kid'); expect(maya?.connectionsApprovedBy).toBeUndefined();
 const controls=await t.run(ctx=>ctx.db.query('kidControls').withIndex('by_family_member',q=>q.eq('familyId',viewer.family._id).eq('memberId',maya!._id)).unique()); expect(controls?.parentsCanReadChat).toBe(false);
 await expect(t.withIdentity({subject:'sample:partner'}).mutation(api.demoConsole.reset,{runId:run.runId,mode:'story'})).rejects.toThrow();
 await admin.mutation(api.demoConsole.reset,{runId:run.runId,mode:'story'});
 expect((await admin.query(api.demoConsole.state,{}))!.runId).not.toBe(run.runId);
 expect(await t.run(ctx=>ctx.db.get(seeded.familyId))).not.toBeNull();
 expect(demoEmail('run-x','2026-11-03','pickup',1).recipient).toBe(C.personas[2].email);
 expect(demoDate(Date.UTC(2026,9,30,12))).toBe('2026-11-02');
});
test('double tap queues once, sender allowlist, distinct recipient ids, old mail rejected',async()=>{
 const {t,admin,run,viewer}=await setup();
 await expect(t.mutation(internal.demoConsole.claim,{sender:'someone@example.com'})).rejects.toThrow();
 await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email});
 const args={runId:run.runId,stage:'meeting' as const,expectedAttempt:0};
 await admin.mutation(api.demoConsole.trigger,args); await admin.mutation(api.demoConsole.trigger,args);
 const job=await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email}); expect(job?.attempt).toBe(1);
 expect(await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email})).toBeNull();
 await expect(admin.mutation(api.demoConsole.reset,{runId:run.runId,mode:'story'})).rejects.toThrow();
 expect(await t.mutation(internal.demoConsole.noteMail,{familyId:viewer.family._id,subject:job!.subject,messageId:'recipient-id'})).toBe(true);
 await t.mutation(internal.demoConsole.finish,{runId:run.runId,stage:'meeting',attempt:1,messageId:'sender-id'});
 const state=(await admin.query(api.demoConsole.state,{}))!; expect(state.stages[0]).toMatchObject({status:'sent',received:true});
 await admin.mutation(api.demoConsole.reset,{runId:run.runId,mode:'story'});
 expect(await t.mutation(internal.demoConsole.noteMail,{familyId:viewer.family._id,subject:job!.subject,messageId:'recipient-id'})).toBe(false);
 expect(await t.mutation(internal.demoConsole.noteMail,{familyId:viewer.family._id,subject:'MEGA_TEST unrelated',messageId:'other'})).toBe(false);
});
test('uncertain sends do not retry; presenter can close attempt without sending',async()=>{
 const {t,admin,run}=await setup(); await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email});
 await admin.mutation(api.demoConsole.trigger,{runId:run.runId,stage:'meeting',expectedAttempt:0}); await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email});
 await t.mutation(internal.demoConsole.finish,{runId:run.runId,stage:'meeting',attempt:1,error:'Unknown'});
 await expect(admin.mutation(api.demoConsole.trigger,{runId:run.runId,stage:'meeting',expectedAttempt:1})).rejects.toThrow();
 await admin.mutation(api.demoConsole.abandon,{runId:run.runId,stage:'meeting',expectedAttempt:1});
 expect(await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email})).toBeNull();
 vi.stubEnv('DEMO_MODE','false'); await expect(admin.query(api.demoConsole.state,{})).rejects.toThrow();
});

test('11111 works for a renamed child and is limited to the owning presenter’s active rehearsal',async()=>{
 const {t,admin,viewer,run}=await setup();
 await t.run(ctx=>ctx.db.patch(viewer.family._id,{parentCode:'54321'}));
 await admin.mutation(api.demoConsole.prepare,{runId:run.runId});
 const maya=(await admin.query(api.demoConsole.state,{}))!.personas.find(p=>p.key==='daughter')!;
 await t.run(ctx=>ctx.db.patch(maya.memberId!,{name:'Anela'}));
 const invite=await admin.mutation(api.invites.create,{memberId:maya.memberId!});
 const lookup=(authId:string)=>t.query(internal.invites.prepareRedeem,{token:invite.url,authId});
 expect(await lookup('ordinary-recipient')).toMatchObject({parentCode:'54321'});
 await admin.mutation(api.demo.testInvite,{token:invite.url,expectedMemberId:viewer.member._id});
 expect(await lookup('sample:admin')).toMatchObject({parentCode:'11111'});
 vi.stubEnv('DEMO_MODE','false');
 expect(await lookup('sample:admin')).toMatchObject({parentCode:'54321'});
 vi.stubEnv('DEMO_MODE','true');
 await t.run(ctx=>ctx.db.patch(run.runId,{active:false}));
 expect(await lookup('sample:admin')).toMatchObject({parentCode:'54321'});
 await t.run(ctx=>ctx.db.patch(run.runId,{active:true}));
 await expect(admin.action(api.invites.redeem,{token:invite.url,parentCode:'22222'})).rejects.toThrow();
 await admin.action(api.invites.redeem,{token:invite.url,parentCode:'11111'});
 expect((await admin.query(api.me.get,{}))!.member._id).toBe(maya.memberId);
});

test('renamed demo people drive previews and queued emails without duplicate rehearsal members', async () => {
 const {t,admin,viewer,run}=await setup();
 await admin.mutation(api.demoConsole.prepare,{runId:run.runId});
 const people=(await admin.query(api.demoConsole.state,{}))!.personas;
 await t.run(async ctx => {
   await ctx.db.patch(viewer.member._id,{name:'Alex'});
   await ctx.db.patch(people[1].memberId!,{name:'Sam'});
   await ctx.db.patch(people[2].memberId!,{name:'Anela'});
   await ctx.db.insert('integrations',{familyId:viewer.family._id,memberId:people[2].memberId!,kind:'gmail',config:{},status:'connected',label:C.personas[2].email});
   await ctx.db.insert('schedulingPreferences',{familyId:viewer.family._id,memberId:people[2].memberId!,enabled:true,autoCapture:true,availabilityFor:[]});
 });
 await admin.mutation(api.demoConsole.prepare,{runId:run.runId});
 const state=(await admin.query(api.demoConsole.state,{}))!;
 expect(state.personas.map(p=>p.name)).toEqual(['Alex','Sam','Anela']);
 expect(state.stages[1].body).toContain('Hi Sam and Alex,');
 expect(state.stages[2].title).toBe('Anela’s pickup change');
 expect(state.stages[2].subject).toContain('Anela’s drama');
 expect(state.stages[2].body).toContain('Hi Anela,');
 expect(await t.run(ctx=>ctx.db.query('members').withIndex('by_family',q=>q.eq('familyId',viewer.family._id)).collect())).toHaveLength(3);
 await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email});
 await admin.mutation(api.demoConsole.trigger,{runId:run.runId,stage:'pickup',expectedAttempt:0});
 // An already confirmed email keeps its original contents if the member is renamed later.
 await t.run(ctx=>ctx.db.patch(people[2].memberId!,{name:'Ana'}));
 const job=await t.mutation(internal.demoConsole.claim,{sender:C.personas[0].email});
 expect(job?.body).toBe(state.stages[2].body);
 expect(job?.subject).toBe(state.stages[2].subject);
 expect(job?.recipient).toBe(C.personas[2].email);
 expect(await t.mutation(internal.demoConsole.noteMail,{familyId:viewer.family._id,subject:job!.subject,messageId:'anela-pickup'})).toBe(true);
});
