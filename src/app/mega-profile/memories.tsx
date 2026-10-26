// What it remembers (admin only, PLAN §3): search and delete.
import { useState } from 'react';
import { router } from 'expo-router';
import { useForgetMemory, useMemories } from '@/data/useMega';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { MemoriesContent } from '@/features/profile/MemoriesContent';

export default function MemoriesRoute() {
  const [search, setSearch] = useState('');
  const memories = useMemories(search || undefined);
  const forget = useForgetMemory();

  return (
    <Sheet title="What it remembers" onClose={() => router.back()}>
      {memories.status === 'LoadingFirstPage' ? (
        <LoadingScreen label="Loading memories…" />
      ) : (
        <MemoriesContent memories={memories.results} search={search} onSearch={setSearch} onForget={(memoryId) => forget({ memoryId: memoryId as never })} />
      )}
    </Sheet>
  );
}
