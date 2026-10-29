// G8 correctness review: the load flake (HqRoom, Welcome, join, Store pass alone, fail under the full parallel
// run). jest's testTimeout was raised to 20s, but RNTL's own waitFor/findBy poll gave up after its default 1s,
// so a busy machine still failed them. jestSetup sets RNTL's asyncUtilTimeout to match jest's; this checks the
// behavior (RNTL 14 doesn't export getConfig): a waitFor with no timeout outlasts the old 1s default.
import { waitFor } from '@testing-library/react-native';

test('waitFor waits past RNTL’s 1s default (asyncUtilTimeout matches jest’s testTimeout)', async () => {
  let ready = false;
  setTimeout(() => {
    ready = true;
  }, 1500);
  await waitFor(() => expect(ready).toBe(true));
});
