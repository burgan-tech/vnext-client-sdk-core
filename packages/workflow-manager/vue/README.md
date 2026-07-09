# amorphie-workflow-manager-vue

Vue 3 adapter for [`amorphie-workflow-manager`](../ts-amorphie-workflow-manager). Exposes a single composable, `useWorkflow()`, that mirrors the SDK's cached state into Vue refs and cleans up automatically on component unmount.

## Install

```sh
npm install amorphie-workflow-manager amorphie-workflow-manager-vue vue
```

`amorphie-workflow-manager` and `vue` are peer dependencies.

## Usage

Provide the singleton manager in your app entry:

```ts
// main.ts
import { createApp } from 'vue';
import { WorkflowManager } from 'amorphie-workflow-manager';
import { WorkflowManagerKey } from 'amorphie-workflow-manager-vue';
import App from './App.vue';

const wm = WorkflowManager.create({
  http: /* HttpDelegate */,
  workflows: [{ domain: 'onboarding', name: 'kyc-flow', version: '1.0.0' }],
});

createApp(App).provide(WorkflowManagerKey, wm).mount('#app');
```

Use it in any component:

```ts
// KycView.vue (script setup)
import { useWorkflow, useInjectWorkflowManager } from 'amorphie-workflow-manager-vue';

const manager = useInjectWorkflowManager();
const wf = useWorkflow({ manager, domain: 'onboarding', name: 'kyc-flow' });

await wf.start({ attributes: { channel: 'web' } });
// wf.state, wf.status, wf.view, wf.transitions are reactive
```

Available reactive properties: `state`, `status`, `currentState`, `view`, `data`, `transitions`, `loading`, `error`, `navigation`, `ready`, `isTerminal`.

Actions: `start`, `transition`, `confirm`, `cancelAwaiting`, `retry`, `continueWith`, `terminate`, plus `attach` / `detach` for manual lifecycle and `on(event, handler)` as an escape hatch.

## What is intentionally NOT in this package

- **No view rendering.** UI views are surfaced through `wf.view` (and `navigationRequested`); rendering them is the host's job. In the Burgan stack `@burgantech/pseudo-ui/vue` does that.
- **No `<WorkflowOutlet>` component.** A composable + the host's existing layout is enough; an extra wrapper component would only shadow what the renderer already does.

## License

UNLICENSED — internal use.
