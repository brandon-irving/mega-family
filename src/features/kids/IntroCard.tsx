// Board KidsIntro (canvas v33; owner Oct 28: never an empty chat). The `{ kind: 'intro' }` card `chat.start`
// writes into a kid's thread on first open: "Here's what we can do", one row per thing their MEGA helps with
// (config KID_INTRO). "Show me" sends that row's question as the kid's own message, so the MEGA explains it
// live in the thread, the same as if they'd typed it.
import { useState } from 'react';
import { fillCopy } from '@shared/config/copy';
import { KID_INTRO } from '@shared/config/starters';
import { useSendMessage } from '@/data/useChat';
import { IdeaRow, ThreadCard } from '@/ui/ThreadCard';

export function IntroCardView({ megaName, asked, onAsk }: { megaName: string; asked: readonly string[]; onAsk: (rowId: string, ask: string) => void }) {
  return (
    <ThreadCard from={fillCopy(KID_INTRO.card.from, { mega: megaName })} title={KID_INTRO.card.title}>
      {KID_INTRO.rows.map((row) => (
        <IdeaRow key={row.id} title={row.title} why={row.why} actionLabel={row.act} done={asked.includes(row.id)} onPress={() => onAsk(row.id, row.ask)} />
      ))}
    </ThreadCard>
  );
}

export function IntroCard({ megaName }: { megaName: string }) {
  const send = useSendMessage();
  const [asked, setAsked] = useState<string[]>([]);
  return (
    <IntroCardView
      megaName={megaName}
      asked={asked}
      onAsk={(rowId, ask) => {
        setAsked((prev) => [...prev, rowId]);
        void send({ text: ask, via: 'text' }).catch(() => setAsked((prev) => prev.filter((id) => id !== rowId)));
      }}
    />
  );
}
