# vNext SDK — Integrated Vue Sample

A single Vue 3 app that wires **all five vNext TypeScript SDKs** together.

- The **Morph API** demo screen mocks its network in-browser with MSW.
- The **Workflow (KYC)** screen talks to the **real** `test-vnext-morph-idm`
  backend (through a Vite dev proxy), driving the live `morph-idm / client`
  workflow instance `IbWeb`.

No Keycloak or Docker required — morph's mandatory auth context is satisfied by a
mock client-credentials token (the test workflow API is public and ignores it).

## SDKs used

| SDK | Package(s) | Role in this app |
|-----|-----------|------------------|
| morph-api | `@morph/core` · `oauth2` · `logger` · `browser-storage` | HTTP client + OAuth2 (client-credentials) transport |
| pseudo-ui | `@burgan-tech/pseudo-ui/vue` | Server-driven UI renderer (Vue-only build) |
| page-router | `page-router` · `page-router-vue` | Navigation + view lifecycle (the app shell) |
| context-store | `@burgantech/context-store` | Shared reactive state bus |
| workflow-manager | `amorphie-workflow-manager` (+ `-vue`) | Workflow state machine |

## Run

From the repo root (installs + links the workspace packages):

```bash
npm install
npm run build          # build the SDK packages first
```

Then start the app:

```bash
cd examples/vue-app
npm run dev            # http://localhost:5173
```

> The MSW service worker (`public/mockServiceWorker.js`) is committed. If it is
> ever missing, regenerate it with `npm run mock:init`.

## Screens

- **Home** — overview of the wired SDKs.
- **Clients (IDM)** — a client-management console over the **real**
  `morph-idm / client` workflow: lists clients (`queryInstances`, paginated),
  creates new ones (`startWorkflow` → draft), and changes status
  (active → passive via `startTransition`). Every mutation goes through a
  confirm dialog; migration/fact clients are protected. Opening a client goes to:
- **Client detail** — attaches to the instance (`continueWith`), renders its
  server-driven view with pseudo-ui, and drives transitions. A transition's own
  form (e.g. `update` / `publish`) is itself a server-driven pseudo-ui view,
  fetched through morph-api and rendered inline; submitting runs the transition.
- **Workflow (IbWeb)** — a focused single-instance demo of the same mechanism.
- **Pseudo-UI Form** — a standalone JSON-defined view rendered by pseudo-ui; the
  submitted payload is written to the context-store.
- **Workflow (KYC)** — the flagship integration against the **real** backend:
  `workflow-manager` attaches to the live `morph-idm / client` instance `IbWeb`
  (via `morph-api`'s `MorphHttpDelegate` over the Vite proxy), polls its state,
  and renders the server-driven view — which is a **pseudo-ui `ViewDefinition`**.
  A pseudo-ui *submit* (whose `command` is the transition key) fires the next
  workflow transition. An offline in-memory alternative lives in
  `src/mocks/workflow-backend.ts`.
- **Morph API** — acquires a client-credentials token and makes an authenticated
  `GET /accounts`; both the token endpoint and the API are mocked by MSW.
- **Context Store** — read/write shared state; values written by other screens
  appear here reactively.

## How it fits together

```
page-router (shell)  ──renders──▶  view components
                                        │
   Workflow (KYC) ────────────────────▶ workflow-manager ──(HttpDelegate: in-memory)──▶ state machine
                                        │                                                    │
                                        └── step view.content (pseudo-ui ViewDefinition) ◀───┘
                                        │
   pseudo-ui <PseudoView> ── submit ───▶ wf.transition(...)

   Morph API view ─────────▶ morph-api ──(MSW)──▶ /idp/token, /api/accounts

   context-store  ◀── shared reactive bus, read/written by every screen
```

## Notes

- `pseudo-ui` is consumed as a **Vue-only** build in this repo — the Angular and
  React adapters were removed. It requires PrimeVue + a `@primeuix/themes` preset
  (set up in `src/main.ts`).
- `vite.config.ts` sets `build.target: 'es2022'` (page-router boot uses top-level
  await), `resolve.dedupe: ['vue','primevue']`, and excludes the SDK packages
  from dep pre-bundling so SDK rebuilds are picked up on reload.
