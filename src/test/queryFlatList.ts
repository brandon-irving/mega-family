// @testing-library/react-native's TestInstance tree is host-components-only (no composite component
// like FlatList shows up by name), but FlatList forwards its own props (data/inverted/ListHeaderComponent/
// ListFooterComponent/...) straight onto the host scroll view it renders, so querying for a host node
// that has an `inverted` key and an array `data` prop is the one reliable way to get at a FlatList's
// configuration from a rendered tree.
type Instance = { props: Record<string, unknown> };
type QueryableRoot = Instance & { queryAll: (predicate: (instance: Instance) => boolean) => Instance[] };

const isFlatListHost = (i: Instance) => Array.isArray(i.props.data) && 'inverted' in i.props;

export function queryFlatListProps(root: QueryableRoot | null): Record<string, unknown> {
  if (!root) throw new Error('No FlatList found in the rendered tree');
  // `queryAll` only searches *descendants* — the FlatList's own scroll view can be the render tree's
  // root node itself (nothing wraps it), so the root has to be checked too, not just its children.
  const matches = [root, ...root.queryAll(isFlatListHost)].filter(isFlatListHost);
  if (matches.length === 0) throw new Error('No FlatList found in the rendered tree');
  if (matches.length > 1) throw new Error('More than one FlatList found in the rendered tree');
  return matches[0].props;
}
