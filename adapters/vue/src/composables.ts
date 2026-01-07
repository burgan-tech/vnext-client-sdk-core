/**
 * Vue Composable - SDK Instance
 */

import { inject, type InjectionKey } from 'vue';
import type { VNextSDK } from '@vnext/core-ts';

export const VNextSDKKey: InjectionKey<VNextSDK> = Symbol('vnext-sdk');

export function useVNextSDK(): VNextSDK {
  const sdk = inject(VNextSDKKey);
  if (!sdk) {
    throw new Error('VNextSDK not found. Make sure to install the Vue plugin.');
  }
  return sdk;
}

