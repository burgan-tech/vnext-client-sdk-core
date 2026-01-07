/**
 * useRouter Hook
 */

import { ref, computed, onUnmounted } from 'vue';
import type { Route, NavigationOptions, InterfaceMode, BannerConfig } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useRouter() {
  const sdk = useVNextSDK();
  const currentRoute = ref<Route | undefined>(sdk.router.getCurrentRoute());
  const mode = ref<InterfaceMode>(sdk.router.getMode());

  // Subscribe to route changes
  const unsubscribe = sdk.router.onRouteChange((route) => {
    currentRoute.value = route;
  });

  onUnmounted(() => {
    unsubscribe();
  });

  const navigate = async (route: Route | string, options?: NavigationOptions) => {
    await sdk.router.navigate(route, options);
  };

  const goBack = () => {
    sdk.router.goBack();
  };

  const replace = async (route: Route | string, options?: NavigationOptions) => {
    await sdk.router.replace(route, options);
  };

  const setMode = (newMode: InterfaceMode) => {
    sdk.router.setMode(newMode);
    mode.value = newMode;
  };

  const showBanner = (banner: BannerConfig) => {
    sdk.router.showBanner(banner);
  };

  const hideBanner = (id: string) => {
    sdk.router.hideBanner(id);
  };

  const clearBanners = () => {
    sdk.router.clearBanners();
  };

  return {
    currentRoute: computed(() => currentRoute.value),
    mode: computed(() => mode.value),
    navigate,
    goBack,
    replace,
    setMode,
    showBanner,
    hideBanner,
    clearBanners,
  };
}

