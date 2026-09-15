/**
 * @format
 *
 * A smoke test, and deliberately a shallow one: it mounts the WHOLE app — the provider, the five
 * tabs, the launch-contract listeners — against the stubbed bridge in `jest.setup.js`, and its
 * only assertion is that none of that throws. What each control does is verified on a device;
 * what this catches is the class of breakage that makes the app unlaunchable, in two seconds.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

test('mounts and unmounts without throwing', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  // Unmounting matters: the provider withdraws its listeners and its gates there, and a throw on
  // that path is how a gate outlives its presenter.
  await ReactTestRenderer.act(async () => {
    tree?.unmount();
  });
});
