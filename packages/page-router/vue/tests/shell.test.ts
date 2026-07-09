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
import { PageRouterShell, createVueSurfaceFactory } from '../src/index.js';

const FooView = defineComponent({
  name: 'FooView',
  props: { item: { type: Object, required: true } },
  render() {
    return h('div', { class: 'foo-view' }, `foo:${(this.item as { key: string }).key}`);
  },
});

const ConfirmDialog = defineComponent({
  name: 'ConfirmDialog',
  props: { op: { type: String, required: false, default: '' } },
  render() {
    return h('div', { class: 'confirm' }, `confirm:${this.op}`);
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
        key: 'confirm',
        config: {},
        inputs: [{ name: 'op', required: true }],
        presentation: 'overlay',
        lifetime: RouteLifetime.transient,
        defaultTitle: { en: 'Confirm' },
      },
    ],
  };
  const createViewSurface = createVueSurfaceFactory((key) =>
    key === 'foo' ? FooView : key === 'confirm' ? ConfirmDialog : null,
  );
  return createPageRouter({
    routeRegistry: registry,
    onEvaluate: async ({ item }) => [item],
    onNavigate: async () => undefined,
    createViewSurface,
    disposeViewSurface: async () => undefined,
  });
}

describe('PageRouterShell', () => {
  it('renders empty state when no active tab', async () => {
    const router = await bootRouter();
    const wrapper = mount(PageRouterShell, { props: { router } });
    expect(wrapper.find('.page-router-empty').exists()).toBe(true);
    expect(wrapper.find('.page-router-active').exists()).toBe(false);
  });

  it('renders the active tab surface mount component', async () => {
    const router = await bootRouter();
    const wrapper = mount(PageRouterShell, { props: { router } });
    await router.navigate({ routeKey: 'foo' });
    await nextTick();
    expect(wrapper.find('.page-router-active').exists()).toBe(true);
    expect(wrapper.find('.foo-view').exists()).toBe(true);
    expect(wrapper.find('.foo-view').text()).toBe('foo:foo');
  });

  it('stacks overlays above the active tab', async () => {
    const router = await bootRouter();
    const wrapper = mount(PageRouterShell, { props: { router } });
    await router.navigate({ routeKey: 'foo' });
    await router.navigate({ routeKey: 'confirm', extraData: { op: 'delete' } });
    await nextTick();
    expect(wrapper.find('.page-router-active').exists()).toBe(true);
    expect(wrapper.find('.foo-view').exists()).toBe(true);
    const overlayLayer = wrapper.find('.page-router-overlay-layer');
    expect(overlayLayer.exists()).toBe(true);
    expect(overlayLayer.findAll('.page-router-overlay')).toHaveLength(1);
    expect(overlayLayer.find('.confirm').text()).toBe('confirm:delete');
  });

  it('updates rendered overlays when goBack dismisses the top overlay', async () => {
    const router = await bootRouter();
    const wrapper = mount(PageRouterShell, { props: { router } });
    await router.navigate({ routeKey: 'foo' });
    await router.navigate({ routeKey: 'confirm', extraData: { op: 'x' } });
    await nextTick();
    expect(wrapper.find('.confirm').exists()).toBe(true);
    await router.goBack();
    await nextTick();
    expect(wrapper.find('.confirm').exists()).toBe(false);
    expect(wrapper.find('.page-router-overlay-layer').exists()).toBe(false);
  });
});
