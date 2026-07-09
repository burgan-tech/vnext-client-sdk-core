import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type IPageRouter,
  type RouteRegistry,
} from 'page-router';
import { createVueSurfaceFactory, usePageRouter } from '../src/index.js';

const FooView = defineComponent({
  name: 'FooView',
  props: { item: { type: Object, required: true } },
  render() {
    return h('div', { class: 'foo' }, `foo:${(this.item as { key: string }).key}`);
  },
});

const BarView = defineComponent({
  name: 'BarView',
  props: { accountNo: { type: String, required: true } },
  render() {
    return h('div', { class: 'bar' }, `bar:${this.accountNo}`);
  },
});

async function bootRouter(): Promise<IPageRouter> {
  const registry: RouteRegistry = {
    config: { shellMode: ShellMode.mdi, locale: 'en' },
    routes: [
      {
        key: 'foo',
        config: {},
        lifetime: RouteLifetime.singleton,
        defaultTitle: { en: 'Foo' },
      },
      {
        key: 'bar',
        config: {},
        inputs: [{ name: 'accountNo', required: true }],
        singletonKey: ['accountNo'],
        lifetime: RouteLifetime.singleton,
        defaultTitle: { en: 'Bar {{accountNo}}' },
      },
    ],
  };
  const createViewSurface = createVueSurfaceFactory((key) =>
    key === 'foo' ? FooView : key === 'bar' ? BarView : null,
  );
  return createPageRouter({
    routeRegistry: registry,
    onEvaluate: async ({ item }) => [item],
    onNavigate: async () => undefined,
    createViewSurface,
    disposeViewSurface: async () => undefined,
  });
}

describe('usePageRouter — reactive bindings', () => {
  it('exposes initial router state through reactive refs', async () => {
    const router = await bootRouter();
    let captured!: ReturnType<typeof usePageRouter>;
    const Probe = defineComponent({
      setup() {
        captured = usePageRouter(router);
        return () => h('div');
      },
    });
    mount(Probe);
    expect(captured.shellMode.value).toBe(ShellMode.mdi);
    expect(captured.locale.value).toBe('en');
    expect(captured.openTabs.value).toHaveLength(0);
    expect(captured.activeTab.value).toBeNull();
    expect(captured.homepage.value).toBeNull();
  });

  it('updates openTabs / activeTab when navigate runs', async () => {
    const router = await bootRouter();
    let captured!: ReturnType<typeof usePageRouter>;
    const Probe = defineComponent({
      setup() {
        captured = usePageRouter(router);
        return () => h('div');
      },
    });
    mount(Probe);

    await router.navigate({ routeKey: 'foo' });
    await nextTick();
    expect(captured.openTabs.value).toHaveLength(1);
    expect(captured.activeTab.value?.item.key).toBe('foo');

    await router.navigate({ routeKey: 'bar', extraData: { accountNo: 'TR-1' } });
    await nextTick();
    expect(captured.openTabs.value).toHaveLength(2);
    expect(captured.activeTab.value?.payload['accountNo']).toBe('TR-1');
  });

  it('updates locale + homepage refs through their respective signals', async () => {
    const router = await bootRouter();
    let captured!: ReturnType<typeof usePageRouter>;
    const Probe = defineComponent({
      setup() {
        captured = usePageRouter(router);
        return () => h('div');
      },
    });
    mount(Probe);

    router.setLocale('tr');
    await nextTick();
    expect(captured.locale.value).toBe('tr');

    await router.setHomepage({ routeKey: 'foo' });
    await nextTick();
    expect(captured.homepage.value).toEqual({ routeKey: 'foo' });
    expect(captured.openTabs.value).toHaveLength(1);
  });

  it('emits a fresh array reference on tab open AND close so shallowRef triggers re-render', async () => {
    // Pins the bug seen in the POC: SDK getters return their internal arrays
    // by reference. If the composable forwards that same reference into
    // shallowRef.value, Vue's `Object.is` check sees no change and templates
    // never re-render — leaving the X button bound to a stale tabKey that
    // no longer exists, which trips `tab-not-found` warns on close.
    const router = await bootRouter();
    let captured!: ReturnType<typeof usePageRouter>;
    const Probe = defineComponent({
      setup() {
        captured = usePageRouter(router);
        return () => h('div');
      },
    });
    mount(Probe);

    // Open three transient-style instances of `bar` (different singleton keys).
    await router.navigate({ routeKey: 'bar', extraData: { accountNo: 'A1' } });
    const refAfterOpen1 = captured.openTabs.value;
    await router.navigate({ routeKey: 'bar', extraData: { accountNo: 'A2' } });
    const refAfterOpen2 = captured.openTabs.value;
    await router.navigate({ routeKey: 'bar', extraData: { accountNo: 'A3' } });
    const refAfterOpen3 = captured.openTabs.value;
    await nextTick();

    expect(captured.openTabs.value).toHaveLength(3);
    // Each navigate must produce a new array reference (not just mutate the
    // existing one) — otherwise Vue's reactivity skips the re-render.
    expect(refAfterOpen2).not.toBe(refAfterOpen1);
    expect(refAfterOpen3).not.toBe(refAfterOpen2);

    // Close the middle tab. UI must observe both content + reference change.
    const middleKey = captured.openTabs.value[1]!.tabKey;
    const refBeforeClose = captured.openTabs.value;
    await router.closeTab(middleKey);
    await nextTick();

    expect(captured.openTabs.value).toHaveLength(2);
    expect(captured.openTabs.value).not.toBe(refBeforeClose);
    expect(captured.openTabs.value.find((t) => t.tabKey === middleKey)).toBeUndefined();
  });

  it('refreshes openTabs when markTabDirty toggles isDirty', async () => {
    // The host shell relies on `t.isDirty` to gate the close confirmation.
    // If markTabDirty mutates the OpenTab record but no signal fires, the
    // shallowRef stays stale and the UI never paints the dirty marker.
    const router = await bootRouter();
    let captured!: ReturnType<typeof usePageRouter>;
    const Probe = defineComponent({
      setup() {
        captured = usePageRouter(router);
        return () => h('div');
      },
    });
    mount(Probe);

    await router.navigate({ routeKey: 'foo' });
    await nextTick();
    const cleanRef = captured.openTabs.value;
    expect(cleanRef[0]!.isDirty).toBe(false);

    router.markTabDirty(cleanRef[0]!.tabKey, true);
    await nextTick();
    expect(captured.openTabs.value).not.toBe(cleanRef);
    expect(captured.openTabs.value[0]!.isDirty).toBe(true);

    router.markTabDirty(cleanRef[0]!.tabKey, false);
    await nextTick();
    expect(captured.openTabs.value[0]!.isDirty).toBe(false);
  });

  it('responds to overlay open/close signals', async () => {
    const router = await bootRouter();
    let captured!: ReturnType<typeof usePageRouter>;
    const Probe = defineComponent({
      setup() {
        captured = usePageRouter(router);
        return () => h('div');
      },
    });
    mount(Probe);

    await router.navigate({ routeKey: 'foo' });
    await nextTick();
    expect(captured.overlays.value).toHaveLength(0);
  });
});
