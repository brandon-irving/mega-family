import { Platform } from 'react-native';
import { createRecorder, type Storage } from './store';
const prefix = 'mega-demo-recording-';
// Import lazily: non-demo sessions never initialize the file module.
async function directory() {
  const fs = await import('expo-file-system/legacy');
  if (!fs.documentDirectory) throw new Error('Device storage unavailable');
  const path = `${fs.documentDirectory}demo-recordings/`;
  await fs.makeDirectoryAsync(path, { intermediates: true });
  return { fs, path };
}
function filename(key: string) { return `${encodeURIComponent(key)}.json`; }
const storage: Storage = {
  async read(key) {
    if (Platform.OS === 'web') return localStorage.getItem(prefix+key);
    const {fs,path} = await directory(); const file = path+filename(key);
    if (!(await fs.getInfoAsync(file)).exists) return null;
    try { const text = await fs.readAsStringAsync(file); JSON.parse(text); return text; }
    catch { const backup = `${file}.backup`; if (!(await fs.getInfoAsync(backup)).exists) throw new Error('Recording is damaged'); return fs.readAsStringAsync(backup); }
  },
  async write(key,value) {
    if (Platform.OS === 'web') { localStorage.setItem(prefix+key,value); return; }
    const {fs,path} = await directory(); const file = path+filename(key);
    if ((await fs.getInfoAsync(file)).exists) { const old = await fs.readAsStringAsync(file); try { JSON.parse(old); await fs.writeAsStringAsync(`${file}.backup`,old); } catch { /* Preserve the last valid backup. */ } }
    await fs.writeAsStringAsync(file,value);
  },
  async keys() {
    if (Platform.OS === 'web') return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));
    const {fs,path} = await directory(); return (await fs.readDirectoryAsync(path)).filter(k=>k.endsWith('.json')).map(k=>decodeURIComponent(k.slice(0,-5)));
  },
  async remove(key) {
    if (Platform.OS === 'web') { localStorage.removeItem(prefix+key); return; }
    const {fs,path} = await directory(); await fs.deleteAsync(path+filename(key),{idempotent:true}); await fs.deleteAsync(path+filename(key)+'.backup',{idempotent:true});
  },
};
export const demoRecorder = createRecorder(storage);
/** Read-only local inspector bridge; never uploads logs or exposes auth credentials. */
if (__DEV__) Object.assign(globalThis, { __MEGA_DEMO_LOGS__: { list: demoRecorder.list, export: demoRecorder.export, status: demoRecorder.status } });

export function recordedAction<A extends unknown[], R>(name: string, action: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    demoRecorder.event('action.start', { name });
    try { const result = await action(...args); demoRecorder.event('action.success', { name }); return result; }
    catch (error) {
      const code = (error as { data?: { code?: unknown } })?.data?.code;
      demoRecorder.event('action.error', { name, error: error instanceof Error ? error.name : 'Error', code: typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : undefined }); throw error;
    }
  };
}
