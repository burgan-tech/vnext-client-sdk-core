# page-router

Framework-agnostic navigation interpreter — route registry, tabs/SDI/MDI shell, history, overlay stack, homepage identity, and `ViewSurface` bridge to a host content layer.

The SDK does **not** render content. It owns the navigation lifecycle and hands off mount handles to the host via delegate callbacks (`onNavigate`, `createViewSurface`, `disposeViewSurface`). The host wires those handles to its own renderer (workflow engine, view library, web view, native components).

API contract is documented in the project's `docs/page-router/page-router-interface.md`.

## Install

```bash
npm install page-router
```

For Vue 3, see the companion adapter `page-router-vue`.

## Status

Phase 1 (TypeScript SDK + Vue adapter + POC). Dart kanadı sonraki fazda eklenecek.

## License

UNLICENSED (private).
