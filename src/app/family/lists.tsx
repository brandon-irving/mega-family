// Full Lists view (PLAN §4), shared presentational component with the Today sheet's lists section.
import { router } from '@/features/shell/navigation';
import { useAddListItem, useCheckListItem, useCreateList, useLists, useRemoveListItem } from '@/data/useLists';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { ListsContent } from '@/features/family/ListsContent';

export default function ListsRoute() {
  const lists = useLists();
  const addItem = useAddListItem();
  const checkItem = useCheckListItem();
  const removeItem = useRemoveListItem();
  const createList = useCreateList();

  if (lists === undefined) return <LoadingScreen label="Loading lists…" />;

  return (
    <Sheet title="Lists" onClose={() => router.back()}>
      <ListsContent
        lists={lists}
        onCreateList={(name, scope) => createList({ name, scope })}
        onAddItem={(listId, text) => addItem({ listId: listId as never, text })}
        onCheckItem={(itemId, checked) => checkItem({ itemId: itemId as never, checked })}
        onRemoveItem={removeItem as never}
      />
    </Sheet>
  );
}
