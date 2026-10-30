import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { router } from '@/features/shell/navigation';
import type { Infer } from 'convex/values';
import type { ideaView } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { IDENTITY } from '@shared/config/identity';
import { IDEAS } from '@shared/config/ideas';
import { IDEAS_COPY as COPY } from '@shared/config/copy';
import { IDEA_SORTS, IDEA_CATEGORY_LABELS, type IdeaCategory, type IdeaSort } from '@shared/domain/ideas';
import { errorCopyFor } from '@/data/errorCopy';
import { useCategorizeIdea, useDismissIdea, useIdeas, useRefreshGiftIdeas, useSetIdeaSaved } from '@/data/useIdeas';
import { GiftsCard } from '@/features/calendar/GiftsCard';
import { Glyph } from '@/features/integrations/glyphs';
import { AppSettingsButton } from '@/features/shell/AppSettingsButton';
import { useRunAction } from '@/features/shell/useRunAction';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ModalSheet } from '@/ui/ModalSheet';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { IdeaCategoryChoices } from './IdeaCategoryChoices';

export type Idea = Infer<typeof ideaView>;
type SetSaved = (args: { ideaId: Id<'ideas'>; saved: boolean }) => Promise<unknown>;

export function IdeasScreen() {
  const tokens = useTokens();
  const [search, setSearch] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [category, setCategory] = useState<IdeaCategory | undefined>();
  const [savedOnly, setSavedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<IdeaSort>(IDEAS.defaultSort);
  const [selectedId, setSelectedId] = useState<Id<'ideas'> | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const setSaved = useSetIdeaSaved();
  const dismiss = useDismissIdea();
  const categorize = useCategorizeIdea();
  const refreshGifts = useRefreshGiftIdeas();
  const trimmedSearch = search.trim();
  const ideas = useIdeas({ category, saved: savedOnly ? true : undefined, search: querySearch || undefined, sort });
  const selected = selectedId ? ideas.results.find((idea) => idea._id === selectedId) : undefined;

  // Search changes one paginated query after typing settles; old query subscriptions are replaced.
  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(trimmedSearch), IDEAS.searchDebounceMs);
    return () => clearTimeout(timer);
  }, [trimmedSearch]);

  // The server bounds and deduplicates this import. It runs once per mount, never per row or render.
  useEffect(() => {
    let active = true;
    refreshGifts({})
      .catch((error) => { if (active) setRefreshError(errorCopyFor(error)); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [refreshGifts]);

  const retryRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try { await refreshGifts({}); }
    catch (error) { setRefreshError(errorCopyFor(error)); }
    finally { setRefreshing(false); }
  };

  const openIdea = useCallback((ideaId: Id<'ideas'>) => setSelectedId(ideaId), []);
  const renderIdea = useCallback(({ item }: { item: Idea }) => <IdeaCard idea={item} onOpen={openIdea} onSetSaved={setSaved} />, [openIdea, setSaved]);
  const filtered = !!category || savedOnly || !!trimmedSearch;
  const clearFilters = () => {
    setSelectedId(null);
    setCategory(undefined);
    setSavedOnly(false);
    setSearch('');
    setQuerySearch('');
  };

  return (
    <Screen presentation="tab" padded={false}>
      <View style={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
        <IdeasHeader />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextInput
              accessibilityLabel={COPY.search}
              placeholder={COPY.search}
              placeholderTextColor={tokens.muted}
              value={search}
              onChangeText={(value) => { setSelectedId(null); setSearch(value); }}
              returnKeyType="search"
              maxLength={IDEAS.searchMaxLength}
              clearButtonMode="while-editing"
              style={{ minHeight: tokens.touchTarget, borderWidth: 1, borderColor: tokens.line, borderRadius: tokens.radii.md, backgroundColor: tokens.surface, paddingHorizontal: tokens.spacing.md, color: tokens.text, fontSize: tokens.type.body.fontSize }}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={COPY.filterAndSort} accessibilityState={{ selected: !!category || savedOnly || sort !== IDEAS.defaultSort }} onPress={() => setFiltersOpen(true)} style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radii.md, borderWidth: 1, borderColor: tokens.line }}><Glyph name="filter" size={22} color={category || savedOnly ? tokens.accent : tokens.text} /></Pressable>
        </View>
        <Text variant="caption" color="muted">{category ? IDEA_CATEGORY_LABELS[category] : COPY.allCategories} · {savedOnly ? COPY.saved : COPY.allIdeas} · {querySearch ? COPY.mostRelevant : COPY.sortLabels[sort]}</Text>
        {refreshing ? <Text variant="caption" color="muted">{COPY.refreshing}</Text> : null}
        {trimmedSearch !== querySearch ? <Text variant="caption" color="muted" accessibilityLiveRegion="polite">{COPY.searching}</Text> : null}
        {refreshError ? (
          <View style={{ gap: tokens.spacing.xs }}>
            <Text variant="caption" color="muted" accessibilityLiveRegion="polite">{COPY.refreshFailed} {refreshError}</Text>
            <Button label={COPY.retryRefresh} variant="ghost" onPress={() => void retryRefresh()} loading={refreshing} />
          </View>
        ) : null}
      </View>
      <FlatList
        testID="ideas-list"
        data={ideas.results}
        keyExtractor={(idea) => idea._id}
        renderItem={renderIdea}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xl, gap: tokens.spacing.md, flexGrow: 1 }}
        ListEmptyComponent={ideas.status === 'LoadingFirstPage' ? (
          <View style={{ paddingVertical: tokens.spacing.xl, gap: tokens.spacing.sm, alignItems: 'center' }}>
            <ActivityIndicator color={tokens.accent} accessibilityLabel={COPY.loadingLabel} />
            <Text color="muted">{COPY.loading}</Text>
          </View>
        ) : (
          <View style={{ paddingVertical: tokens.spacing.xl, gap: tokens.spacing.md }}>
            <Text variant="title">{filtered ? COPY.noMatches : COPY.emptyTitle}</Text>
            <Text color="muted">{filtered ? COPY.noMatchesHint : COPY.emptyHint}</Text>
            <Button label={filtered ? COPY.clearFilters : COPY.openChat} variant="outline" onPress={filtered ? clearFilters : () => router.push('/chat')} />
          </View>
        )}
        ListFooterComponent={ideas.status === 'CanLoadMore' || ideas.status === 'LoadingMore' ? (
          <Button label={COPY.loadMore} variant="ghost" loading={ideas.status === 'LoadingMore'} onPress={() => ideas.loadMore(IDEAS.pageSize)} />
        ) : undefined}
      />
      <ModalSheet open={filtersOpen} title={COPY.filtersTitle} closeLabel={COPY.closeFilters} onClose={() => setFiltersOpen(false)}>
        <Text variant="label">{COPY.show}</Text>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <Chip label={COPY.allIdeas} selected={!savedOnly} onPress={() => setSavedOnly(false)} />
          <Chip label={COPY.saved} selected={savedOnly} onPress={() => setSavedOnly(true)} />
        </View>
        <Text variant="label">{COPY.category}</Text>
        <IdeaCategoryChoices category={category} onChange={setCategory} includeAll />
        <Text variant="label">{COPY.sort}</Text>
        {querySearch ? <Text color="muted">{COPY.relevanceHint}</Text> : <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          {IDEA_SORTS.map(value => <Chip key={value} label={COPY.sortLabels[value]} selected={sort === value} onPress={() => setSort(value)} />)}
        </View>}
        <Button label={COPY.showIdeas} onPress={() => { setSelectedId(null); setFiltersOpen(false); }} />
        <Button label={COPY.resetFilters} variant="ghost" onPress={() => { clearFilters(); setSort(IDEAS.defaultSort); }} />
      </ModalSheet>
      {selected ? (
        <IdeaDetail
          key={selected._id}
          idea={selected}
          onClose={() => setSelectedId(null)}
          onSetSaved={setSaved}
          onDismiss={dismiss}
          onCategorize={categorize}
        />
      ) : null}
    </Screen>
  );
}

export function IdeasHeader() {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md }}>
      <Text variant="title" accessibilityRole="header">{COPY.title}</Text>
      <AppSettingsButton />
    </View>
  );
}

function sourceLabel(idea: Idea) {
  return COPY.sources[idea.source.kind];
}

export const IdeaCard = memo(function IdeaCard({ idea, onOpen, onSetSaved }: { idea: Idea; onOpen: (id: Id<'ideas'>) => void; onSetSaved: SetSaved }) {
  const tokens = useTokens();
  const { busy, error, run } = useRunAction();
  return (
    <View style={{ borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, gap: tokens.spacing.sm }}>
      <Pressable onPress={() => onOpen(idea._id)} accessibilityRole="button" accessibilityLabel={COPY.openIdea(idea.title)} style={{ gap: tokens.spacing.sm }}>
        <Text variant="caption" color="muted">{IDEA_CATEGORY_LABELS[idea.category]} · {sourceLabel(idea)}</Text>
        <Text variant="label" style={{ fontSize: tokens.type.body.fontSize, lineHeight: tokens.type.body.lineHeight }} numberOfLines={2}>{idea.title}</Text>
        <Text color="muted" numberOfLines={3}>{idea.text}</Text>
      </Pressable>
      <Text variant="caption" color="muted">{idea.audience}</Text>
      {idea.saved ? <Text variant="caption" color="accent">{COPY.savedByYou}</Text> : null}
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <Button label={idea.saved ? COPY.saved : COPY.save} accessibilityLabel={idea.saved ? COPY.unsaveTitle(idea.title) : COPY.saveTitle(idea.title)} variant="outline" loading={busy === 'save'} onPress={() => void run('save', () => onSetSaved({ ideaId: idea._id, saved: !idea.saved }))} style={{ flex: 1 }} />
        <Button label={COPY.viewIdea} accessibilityLabel={COPY.viewTitle(idea.title)} variant="ghost" onPress={() => onOpen(idea._id)} style={{ flex: 1 }} />
      </View>
      {error ? <Text variant="caption" style={{ color: tokens.danger }} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
});

function IdeaDetail({ idea, onClose, onSetSaved, onDismiss, onCategorize }: {
  idea: Idea;
  onClose: () => void;
  onSetSaved: SetSaved;
  onDismiss: (args: { ideaId: Id<'ideas'> }) => Promise<unknown>;
  onCategorize: (args: { ideaId: Id<'ideas'>; category: IdeaCategory }) => Promise<unknown>;
}) {
  const tokens = useTokens();
  const { busy, error, run } = useRunAction();
  const sourceMessageId = idea.source.kind === 'gift' ? undefined : idea.source.messageId;
  return (
    <ModalSheet open title={idea.source.kind === 'gift' ? COPY.giftsTitle : idea.title} closeLabel={COPY.closeIdea} onClose={onClose} testID="idea-detail">
      <Text variant="caption" color="muted">{idea.audience}{idea.saved ? ` · ${COPY.savedByYou}` : ''}</Text>
      {idea.source.kind === 'gift' ? <GiftsCard giftIdeasId={idea.source.giftIdeasId} megaName={IDENTITY.name} selectedIndex={idea.source.index} /> : <Text>{idea.text}</Text>}
      <Button label={idea.saved ? COPY.removeSaved : COPY.saveIdea} variant="outline" disabled={busy !== null} loading={busy === 'save'} onPress={() => void run('save', () => onSetSaved({ ideaId: idea._id, saved: !idea.saved }))} />
      {sourceMessageId ? <Button label={COPY.openSource} onPress={() => { onClose(); router.push({ pathname: '/chat/[messageId]', params: { messageId: sourceMessageId } }); }} /> : null}
      {idea.source.kind !== 'gift' ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="label">{COPY.category}</Text>
          <IdeaCategoryChoices category={idea.category} disabled={busy !== null}
            accessibilityLabel={COPY.moveCategory}
            onChange={(value) => { if (value) void run('category', () => onCategorize({ ideaId: idea._id, category: value })); }} />
          {busy === 'category' ? <Text variant="caption" color="muted" accessibilityLiveRegion="polite">{COPY.moving}</Text> : null}
        </View>
      ) : null}
      {error ? <Text variant="caption" style={{ color: tokens.danger }} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button label={COPY.dismiss} variant="ghost" disabled={busy !== null} loading={busy === 'dismiss'} onPress={() => void run('dismiss', () => onDismiss({ ideaId: idea._id })).then((ok) => { if (ok) onClose(); })} />
    </ModalSheet>
  );
}
