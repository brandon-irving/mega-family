import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
const KEY = 'mega.talkIntroduction.v1';
export async function hasSeenTalkIntroduction(): Promise<boolean> {
  try { return (Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY)) === 'yes'; }
  catch { return false; }
}
export async function rememberTalkIntroduction() {
  try { if (Platform.OS === 'web') localStorage.setItem(KEY, 'yes'); else await SecureStore.setItemAsync(KEY, 'yes'); }
  catch { /* The explanation can be shown again when storage is unavailable. */ }
}
