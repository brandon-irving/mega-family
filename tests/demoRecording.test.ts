import { expect, test } from 'vitest';
import { createRecorder, sanitize, type Storage } from '../src/services/demoRecording/store';
function setup() { const files = new Map<string,string>(); const storage: Storage = { read: async k=>files.get(k)??null, write: async(k,v)=>{files.set(k,v);}, keys:async()=>[...files.keys()],remove:async k=>{files.delete(k);} }; return { files, storage, recorder:createRecorder(storage) }; }
const dad = { runId:'run-1',key:'demo-1',familyId:'demo-family',persona:'Dad',memberId:'dad' };
test('records conversations, deduplicates snapshots and preserves each persona across resets and reloads',async()=>{
 const {recorder:r,storage}=setup(); r.event('normal-family'); r.context(dad);
 r.message('other-family','private',{text:'must not record'});
 r.message('demo-family','optimistic:1',{text:'skip duplicate'});
 r.message('demo-family','m1',{text:'Hello'});r.message('demo-family','m1',{text:'Hello'});
 r.context({...dad,persona:'Mom',memberId:'mom'});r.event('interaction.press',{label:'Settings'});
 r.message('demo-family','m2',{text:'Help me plan lunch'}); await r.flush();
 r.context({...dad,runId:'run-2',key:'demo-2'});r.event('new-run');await r.flush();
 const restored=createRecorder(storage);const first=JSON.parse(await restored.export('run-1'));
 expect(first.entries.filter((e:{kind:string})=>e.kind==='conversation.message')).toHaveLength(2);
 expect(first.entries.find((e:{kind:string})=>e.kind==='interaction.press').persona).toBe('Mom');
 expect(JSON.stringify(first)).not.toContain('must not record');expect(JSON.stringify(first)).not.toContain('normal-family');
 expect((await restored.list())).toHaveLength(2);
 r.context(null);r.event('not-demo');await r.flush();expect(await restored.export('run-2')).not.toContain('not-demo');
});
test('redacts credentials and links without removing actual conversation text',()=>{
 expect(sanitize({text:'Hello https://example.com/join/secret',parentCode:'11111',nested:{accessToken:'secret',password:'secret',name:'Mom'}})).toEqual({text:'Hello [link omitted]',nested:{name:'Mom'}});
});
test('serializes overlapping flushes and bounds retained runs',async()=>{
 const {recorder:r}=setup();
 for(let i=0;i<22;i++){r.context({...dad,runId:`run-${i}`});r.event('press',{i});void r.flush();}
 await r.flush();expect((await r.list())).toHaveLength(20);
});
test('storage failures do not crash app interactions and report an actionable status',async()=>{
 const {storage}=setup();storage.write=async()=>{throw new Error('disk full');};const r=createRecorder(storage);r.context(dad);r.event('press');await r.flush();expect(r.status().error).toContain('Could not save');
});

test('equivalent contexts with different property order do not create phantom persona switches',async()=>{
 const {recorder:r}=setup();r.context(dad);
 r.context({persona:dad.persona,memberId:dad.memberId,familyId:dad.familyId,key:dad.key,runId:dad.runId});
 const log=JSON.parse(await r.export(dad.runId));expect(log.entries.map((e:{kind:string})=>e.kind)).toEqual(['session.enter']);
});
