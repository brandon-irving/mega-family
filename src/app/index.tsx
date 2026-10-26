// Placeholder until the frontend track builds the app shell (G1).
import { Text, View } from 'react-native';
import { IDENTITY } from '@shared/config';
import { THEMES } from '@shared/config/theme';

const t = THEMES.midnight;

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <Text style={{ color: t.accent, fontSize: 32, fontWeight: '700' }}>{IDENTITY.name}</Text>
      <Text style={{ color: t.muted, marginTop: 8 }}>{IDENTITY.tagline}</Text>
    </View>
  );
}
