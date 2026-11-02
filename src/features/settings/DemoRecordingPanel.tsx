import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { demoRecorder } from '@/services/demoRecording';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
export function DemoRecordingPanel() {
  const [runs,setRuns] = useState<Awaited<ReturnType<typeof demoRecorder.list>>>([]);
  const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  const refresh = async () => { try { setRuns(await demoRecorder.list()); setError(demoRecorder.status().error ?? ''); } catch { setError('Could not read recordings from this device.'); } };
  useEffect(() => { let mounted = true; demoRecorder.list().then(rows => { if (mounted) { setRuns(rows); setError(demoRecorder.status().error ?? ''); } }).catch(() => { if (mounted) setError('Could not read recordings from this device.'); }); return () => { mounted = false; }; }, []);
  const exportRun = async (id: string, copy: boolean) => {
    if (busy) return; setBusy(true); setError('');
    try { const text = await demoRecorder.export(id); if (copy) { await Clipboard.setStringAsync(text); setError('Recording copied. Paste it into the debugging chat.'); } else await Share.share({ message: text, title: 'MEGA demo recording' }); }
    catch { setError('Could not export this recording. Try Copy recording.'); }
    finally { setBusy(false); }
  };
  return <Card>
    <Text variant="label">Recordings on this device</Text>
    <Text color="muted">Demo conversations and app interactions stay on this phone. Copy or share a recording when debugging. Keeps the latest 20 runs, up to 5,000 entries per run. No keyboard input, audio, passwords, or invite tokens are recorded.</Text>
    <Button label="Refresh recordings" variant="secondary" onPress={() => void refresh()} />
    {runs.length === 0 ? <Text color="muted">A recording starts automatically when you enter a demo.</Text> : null}
    {runs.map(run => <Card key={run.runId}>
      <Text variant="label">{run.key}</Text><Text color="muted">{new Date(run.updatedAt).toLocaleString()} · {run.count} entries{run.dropped ? ` · ${run.dropped} older entries removed` : ''}</Text>
      <Button label="Copy recording" variant="secondary" disabled={busy} onPress={() => void exportRun(run.runId,true)} />
      <Button label="Share recording" variant="ghost" disabled={busy} onPress={() => void exportRun(run.runId,false)} />
    </Card>)}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </Card>;
}
