// Adults can review visible memories; the server retains all existing forget permissions.
import { useState } from 'react';
import { router } from '@/features/shell/navigation';
import { useForgetMemory, useMemories } from '@/data/useMega';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { MemoriesContent } from '@/features/profile/MemoriesContent';
import { AdultOnly } from '@/features/shell/RoleGate';

export default function MemoriesRoute() {
  return <AdultOnly><MemoriesBody /></AdultOnly>;
}

function MemoriesBody() {
  const [search, setSearch] = useState('');
  const memories = useMemories(search || undefined);
  const forget = useForgetMemory();

  return (
    <Sheet title="Memories" onClose={() => router.back()} scroll={false}>
      {memories.status === 'LoadingFirstPage' ? (
        <LoadingScreen label="Loading memories…" />
      ) : (
        <MemoriesContent memories={memories.results} search={search} onSearch={setSearch} onForget={(memoryId) => forget({ memoryId: memoryId as never })} status={memories.status} onLoadMore={() => memories.loadMore(20)} />
      )}
    </Sheet>
  );
}
