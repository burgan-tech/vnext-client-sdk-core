import { defineComponent, h, type PropType } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from './composable.js';
import type { VueViewSurface } from './surface.js';

/**
 * Vue mount root for the page-router. Renders the active tab's surface and
 * stacks every open overlay above it. The host wires up tab strip / nav UI
 * around it; this component is intentionally minimal — it knows how to
 * render `VueViewSurface.mount` and nothing else.
 */
export const PageRouterShell = defineComponent({
  name: 'PageRouterShell',
  props: {
    router: {
      type: Object as PropType<IPageRouter>,
      required: true,
    },
  },
  setup(props) {
    const state = usePageRouter(props.router);

    return () => {
      const tab = state.activeTab.value;
      const tabMount = tab ? (tab.surface as VueViewSurface).mount : null;
      const overlayNodes = state.overlays.value.map((o) => {
        const m = (o.surface as VueViewSurface).mount;
        return h(
          'div',
          { class: 'page-router-overlay', key: o.overlayKey, 'data-overlay-key': o.overlayKey },
          [h(m.component, { ...m.props })],
        );
      });

      return h('div', { class: 'page-router-shell' }, [
        tabMount
          ? h('div', { class: 'page-router-active', 'data-tab-key': tab!.tabKey }, [
              h(tabMount.component, { ...tabMount.props }),
            ])
          : h('div', { class: 'page-router-empty' }, 'No active view'),
        overlayNodes.length > 0
          ? h('div', { class: 'page-router-overlay-layer' }, overlayNodes)
          : null,
      ]);
    };
  },
});
