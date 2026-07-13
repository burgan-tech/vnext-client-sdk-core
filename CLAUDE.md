# vNext Client SDK — project context

## North star
Build a **generic Amorphie/vNext business-UI client** that boots from a SINGLE hardcoded
constant (`clientId`) and pulls EVERYTHING else from backend config: chrome, navigation,
views, auth, token levels, hosts, theme, locales. The guiding rule:

> **"client'ta static ui içeriği tek satır olmamalı"** — not one line of static UI content in the client.

The 5 packages under `packages/` are 100% generic Amorphie SDKs — no solution-specific
concepts (provider names like "morph-idm", token-level literals, URLs) belong in them or in
the sample app. Solution specifics live in backend config. Every improvement must also delete
the dead code it causes.

## Layout
- `packages/` — 5 SDKs (copies, vNext-scoped, editable): `pseudo-ui` (the view renderer),
  `page-router`, `morph-api` (`@morph/*` generic OAuth2/auth client), `workflow-manager`,
  `context-store`. Consumed by the sample from `dist/` via workspace symlinks — **rebuild the
  package after editing** (`app-host` is the exception: consumed from `src` via a Vite alias).
- `packages/app-host/` — the host-composition SDK: `clientId → discover → RouteRegistry →
  page-router → homepage`. Boots MorphClient, resolves token level, builds routes.
- `examples/vue-app/` — the thin Vue host (the "client"). `boot/` = orchestration glue,
  `components/` = 2 thin adapters (NavView = route surface, MasterLayoutRenderer = chrome).
- `../vnext-configuration/` (sibling working dir) — the backend `shell` domain: Workflows,
  Views, config (environment/client-config/navigation), themes. Local bank backend on :4221.

## How the client works (mechanisms)
- **pseudo-ui** renders backend view definitions. Generic nodes emit intents via
  `delegate.onAction(intent, data, command)`; the host maps them. Nodes we added:
  `Navigation` (→ `navigate`), `TabStrip` (→ `tab:activate`/`tab:close`), `WorkflowView`
  (drives a workflow via `delegate.driveWorkflow` → reactive `WorkflowSession`), plus
  `toggle` action, Button `active` (theme-primary fill), Column `class`/`visible`.
- **Chrome is a backend view** (`master-device`/`master-2fa`) with `ContentOutlet ref:"router"`
  (→ PageRouterShell) + nested `Component ref:"shell-profile"`. Switch groups (locale / shell
  mode / token / theme) are uniform `ForEach` over host-fed option arrays with an `active` flag.
- **Everything config-driven**: token levels + privilege order (`morphConfig.tokenLevels`,
  each `{key,label}`), locales + default (`client-config.i18n`), theme switch
  (`client-config.theme.available`), login/token workflow paths (`morphConfig` interactive
  context `delegateMetadata.workflow`). MorphClient is the sole token authority.
- **Label localization**: backend labels use the core `[{language,label}]` array (also
  tolerated: `{en,tr}` map, plain string). ONE canonical resolver: pseudo-ui `localizeLabel`
  (vue-app `sdk/i18n.localize` + navLabel + WorkflowView delegate to it; page-router
  `pickLocaleString` is the aligned copy that can't depend on pseudo-ui).

## Run / test / publish
- Dev: `cd examples/vue-app && npm run dev` (Vite :5173; proxies `/shell`→:4221,
  `/api/v1`→bank IDM). Needs **VPN** for the bank IDM + `docker start dapr-scheduler` if the
  local stack crawls (it crashes on an etcd lease — recurring).
- Test: `cd examples/vue-app && npx playwright test` — 3 specs (boot / history / login).
  Timeouts are long (slow real bank IDM). login.spec does a real 2FA login + change-password.
- Publish backend: `cd ../vnext-configuration && node shell-publish.mjs <keys…>` (Views),
  `node seed-config.mjs` (environment/client-config/navigation — has an update step),
  `node seed-themes.mjs` (themes — cycles deactivate→activate to actually update tokens).

## Gotchas
- **pseudo-ui CSS ships from a CURATED sheet** `src/adapters/vue/pseudo-ui-vue.css` (copied to
  `dist/pseudo-ui.css`, the imported `…/vue/style.css`). A component's `<style scoped>` does
  NOT reach consumers — mirror any new component's classes into the curated sheet by hand.
- **seed re-run gotcha**: `start` on an existing instance key is a no-op (won't overwrite
  attributes); the seeders cycle transitions to actually update.
- Secrets: NEVER commit real secrets to the PUBLIC burgan-tech repos. `environment` uses a
  `{{DEVICE_CLIENT_SECRET}}` placeholder (substituted at seed time). Gitignored: shell-secrets,
  tests/e2e/creds.json.

## Status (2026-07)
Config-driven chain complete; `components/` down to 2 thin adapters; design is theme-driven
(light/dark switch). Remaining non-urgent: staticView `account-list` → real backend view
(phase-2 business content); `apiHeaders` transitional discrete headers (drop once IDM reads
the standard `X-Device`/`X-Actor`); `SHELL_BASE` stays a client constant (it's how config is
fetched).

## Tooling (org)
- **vNext AI Toolkit** (Claude Code plugin, agents for generating vNext components):
  `claude plugin marketplace add burgan-tech/vnext-ai-toolkit` then
  `claude plugin install vnext-ai-toolkit@burgan-tech` (dev clone:
  `git clone https://github.com/burgan-tech/vnext-ai-toolkit.git ~/.claude/plugins/vnext-ai-toolkit`).
- **vNext MCP runtime** (read vNext components/runtime directly):
  `dotnet tool install -g BBT.Workflow.Mcp` then
  `claude mcp add vnext-runtime --env Mcp__OrchestrationBaseUrl=http://localhost:4201 --env Mcp__Domain=shell -- vnext-mcp`.
