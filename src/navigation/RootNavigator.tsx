import React from 'react';
import { LucentPrototype } from '../screens/lucent/LucentPrototype';

/**
 * Lucent UI development shell.
 *
 * This branch intentionally mounts the new product surface directly so visual work can move fast
 * without rewriting Somno's existing state machine yet. The production integration will reconnect
 * Lucent screens to the existing camera, face, PVT, sync and persistence layers once the UI is
 * locked.
 */
export function RootNavigator() {
  return <LucentPrototype />;
}
