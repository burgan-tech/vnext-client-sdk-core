# amorphie-workflow-manager

Non-visual, framework-agnostic TypeScript SDK for the [Amorphie](https://github.com/Burgan-Technology/amorphie) low-code workflow runtime (vNext).

This SDK orchestrates workflow lifecycle (start, transition, retry, continue), runs long polling on the lightweight `state` instance function, parses views, and dispatches action views (URN, HTTP, DeepLink) — all without any UI dependency. View rendering and navigation execution are delegated to the host application via callbacks/events.

## Status

**Phase 1 — initial release.** The package is being authored from the canonical specification under [`docs/`](../../docs/) of this repository.

## Install

```sh
npm install amorphie-workflow-manager @morph/core
```

`@morph/core` is a peer dependency.

## Quick start

```ts
import { MorphClient } from '@morph/core';
import { WorkflowManager, MorphHttpDelegate } from 'amorphie-workflow-manager';

const morph = MorphClient.init(morphConfig, morphOptions);

const wm = WorkflowManager.create({
  http: new MorphHttpDelegate(morph, 'vnext-host', 'vnext/session'),
  workflows: [{ domain: 'onboarding', name: 'kyc-main-flow', version: '1.0.0' }],
  onLog: (level, msg, err, ctx) => console[level](`[wm] ${msg}`, err ?? '', ctx ?? ''),
  onNavigate: (e) => router.push(e.navigationPath),
  onTokenRefresh: (token) => morph.auth('vnext/session').setTokens(token),
});

await wm.startWorkflow({
  domain: 'onboarding',
  name: 'kyc-main-flow',
  attributes: { channel: 'web' },
});
```

## Architecture

- **Public API contract** is defined in [`docs/workflow-manager-interface.md`](../../docs/workflow-manager-interface.md).
- **Functional spec** in [`docs/workflow-manager.md`](../../docs/workflow-manager.md).
- **Internal architecture** in [`docs/architecture.md`](../../docs/architecture.md).
- **Backend contract** in [`docs/backend-api.md`](../../docs/backend-api.md).

## Scripts

```sh
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## License

UNLICENSED — internal use.
