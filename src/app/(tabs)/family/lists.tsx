// Full Lists view (PLAN §4), shared presentational component with the Today sheet's lists section.
import { router } from 'expo-router';
import { useAddListItem, useCheckListItem, useLists, useRemoveListItem } from '@/data/useLists';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { ListsContent } from '@/features/family/ListsContent';

export default function ListsRoute() {
  const lists = useLists();
  const addItem = useAddListItem();
  const checkItem = useCheckListItem();
  const removeItem = useRemoveListItem();

  if (lists === undefined) return <LoadingScreen label="Loading lists…" />;

  return (
    <Sheet title="Lists" onClose={() => router.back()}>
      <ListsContent
        lists={lists}
        onAddItem={(listId, text) => addItem({ listId: listId as never, text })}
        onCheckItem={(itemId, checked) => checkItem({ itemId: itemId as never, checked })}
        onRemoveItem={removeItem as never}
      />
    </Sheet>
  );
}
