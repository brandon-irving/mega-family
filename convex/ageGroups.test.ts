/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { ageGroupOf, canConnectAccounts } from '../shared/ageGroups';
const modules=import.meta.glob('./**/*.ts');
test('age boundaries are separate from authority; unknown minors fail closed',()=>{
 const p={role:'kid' as const,birthday:'2010-11-01'};
 expect(ageGroupOf(p,'2023-10-31')).toBe('child');expect(ageGroupOf(p,'2023-11-01')).toBe('teen');expect(ageGroupOf(p,'2028-11-01')).toBe('adult');
 expect(canConnectAccounts({role:'kid'},'2026-10-31')).toBe(false);
 expect(canConnectAccounts({...p,connectionsApprovedBy:'parent'},'2026-10-31')).toBe(true);
 expect(canConnectAccounts({...p,connectionsApprovedBy:'parent'},'2020-10-31')).toBe(false);
});
test('only a parent approves teen connections; revoke blocks sync and grant completion',async()=>{
 const t=convexTest(schema,modules);const s=await t.mutation(internal.seed.sampleFamily,{weekOf:'2026-10-25'});
 await t.run(ctx=>ctx.db.patch(s.members.twin1,{birthday:undefined,ageGroup:'teen'}));
 const admin=t.withIdentity({subject:'sample:admin'});const teen=t.withIdentity({subject:'sample:twin1'});
 await expect(teen.query(api.scheduling.preferences,{})).rejects.toThrow();
 await expect(teen.mutation(api.family.approveConnections,{memberId:s.members.twin1,approved:true})).rejects.toThrow();
 await admin.mutation(api.family.approveConnections,{memberId:s.members.twin1,approved:true});
 expect(await teen.query(api.scheduling.preferences,{})).toMatchObject({enabled:false});
 await teen.mutation(api.scheduling.setPreferences,{enabled:true,autoCapture:false,availabilityFor:[s.members.admin]});
 await admin.mutation(api.family.approveConnections,{memberId:s.members.twin1,approved:false});
 await expect(teen.query(api.scheduling.preferences,{})).rejects.toThrow();
 const result=await t.mutation(internal.integrations.storeGrant,{familyId:s.familyId,memberId:s.members.twin1,want:['gmail'],accessToken:'fake',refreshToken:'fake',accessTokenExpiresAt:1,scopes:[],email:'test@example.com'});expect(result.connected).toEqual([]);
 const pref=await t.run(ctx=>ctx.db.query('schedulingPreferences').withIndex('by_family_member',q=>q.eq('familyId',s.familyId).eq('memberId',s.members.twin1)).unique());expect(pref).toMatchObject({enabled:false,availabilityFor:[]});
 await expect(admin.mutation(api.family.approveConnections,{memberId:s.members.toddler,approved:true})).rejects.toThrow();
});
