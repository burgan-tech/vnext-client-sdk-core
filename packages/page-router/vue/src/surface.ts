import type { Component } from 'vue';
import type { CreateViewSurface, ViewSurface } from 'page-router';

/**
 * The shape every Vue-backed `ViewSurface` must produce. The `mount` field is
 * the Vue-specific payload that `<PageRouterShell>` knows how to render.
 *
 * - `component`: the Vue component to mount.
 * - `props`: the props passed to the component (typically the route payload).
 *
 * Hosts implementing `createViewSurface` are expected to call
 * {@link createVueSurface} instead of building the surface object by hand.
 */
export interface VueSurfaceMount {
  readonly component: Component;
  readonly props: Record<string, unknown>;
}

export interface VueViewSurface extends ViewSurface {
  readonly mount: VueSurfaceMount;
}

/**
 * Helper for hosts that want a uniform Vue surface factory. The return value
 * is shaped so it satisfies `CreateViewSurface` and emits a `VueViewSurface`
 * understood by `<PageRouterShell>`.
 */
export type VueComponentResolver = (routeKey: string) => Component | null;

export function createVueSurfaceFactory(resolve: VueComponentResolver): CreateViewSurface {
  return async ({ handleKey, item }) => {
    const component = resolve(item.key);
    if (!component) {
      throw new Error(`vue-page-router: no component registered for routeKey '${item.key}'`);
    }
    // Project resolvedData → flat props bag so each view can declare typed
    // props matching its `RouteInput` contract. `handleKey` is also passed so
    // views that need to call back into the router (e.g. `markTabDirty`,
    // `closeTab`) know their own tab/overlay identity without having to
    // reverse-lookup via `findTabs`.
    const props: Record<string, unknown> = { item, handleKey };
    for (const entry of item.resolvedData) {
      if (entry.value !== undefined) props[entry.name] = entry.value;
    }
    const surface: VueViewSurface = { handleKey, mount: { component, props } };
    return surface;
  };
}
