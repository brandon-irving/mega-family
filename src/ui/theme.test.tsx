import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useTheme, useTokens } from './theme';
import { resolveSizing } from '@shared/config/theme';
function Probe() {
  const tokens = useTokens(); const { role } = useTheme();
  return <Text>{JSON.stringify({ role, font: tokens.type.body.fontSize, bigTargets: tokens.bigTargets })}</Text>;
}
test('teen presentation uses adult sizing without changing the protected role', async () => {
  await render(<ThemeProvider initialRole="kid" ageGroup="teen"><Probe /></ThemeProvider>);
  expect(screen.getByText(JSON.stringify({ role: 'kid', font: resolveSizing(false).type.body.fontSize, bigTargets: false }))).toBeTruthy();
});
test('under-13 presentation keeps larger targets', async () => {
  await render(<ThemeProvider initialRole="kid" ageGroup="child"><Probe /></ThemeProvider>);
  expect(screen.getByText(JSON.stringify({ role: 'kid', font: resolveSizing(true).type.body.fontSize, bigTargets: true }))).toBeTruthy();
});
