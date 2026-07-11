# vNext Client SDK — Monorepo

vNext platformunun beş TypeScript client SDK'sını (ve Vue adaptörlerini) tek bir
npm-workspaces monorepo'sunda toplayan, hepsini birlikte kullanan **entegre bir
Vue 3 örnek uygulaması** içeren depo.

> Hedef: SDK'ları yalnızca **vNext seviyesinde** uyumlu tutmak. Flutter/Dart,
> Angular ve React desteği kapsam dışıdır (bkz. [docs/RESTRUCTURE.md](docs/RESTRUCTURE.md)).

## 📦 SDK'lar

| Paket(ler) | Klasör | Rol |
|---|---|---|
| `@morph/core`, `@morph/oauth2`, `@morph/logger`, `@morph/browser-storage` | `packages/morph-api/*` | Config-driven HTTP client + OAuth2 token yaşam döngüsü (transport) |
| `@burgan-tech/pseudo-ui` | `packages/pseudo-ui` | Server-driven UI renderer — **yalnızca Vue** (`/vue` alt-yolu) |
| `page-router`, `page-router-vue` | `packages/page-router/{core,vue}` | Navigasyon + görünüm yaşam döngüsü (uygulama kabuğu) |
| `@burgantech/context-store` | `packages/context-store` | Paylaşılan reaktif state (context) yönetimi |
| `amorphie-workflow-manager`, `amorphie-workflow-manager-vue` | `packages/workflow-manager/{core,vue}` | Amorphie workflow durum-makinesi |

Her paketin kendi `README.md`'si vardır (kaynak repolardan gelir).

### Bağımlılık grafiği

```
@morph/core ── @morph/{oauth2,logger,browser-storage}
      └── amorphie-workflow-manager (peer) ── amorphie-workflow-manager-vue (peer, +vue)
page-router ── page-router-vue (peer, +vue)
@burgantech/context-store            (bağımsız)
@burgan-tech/pseudo-ui  (Vue + PrimeVue)   (bağımsız)
```

## 📁 Proje Yapısı

```
vnext-client-sdk-core/
├── packages/
│   ├── tsconfig.base.json          # page-router paketlerinin ortak TS tabanı
│   ├── morph-api/{core,oauth2,logger,browser-storage}
│   ├── pseudo-ui/                  # Vue-only server-driven renderer
│   ├── page-router/{core,vue}
│   ├── context-store/
│   └── workflow-manager/{core,vue}
├── examples/
│   └── vue-app/                    # 5 SDK'yı birlikte kullanan örnek uygulama
└── docs/                           # Tasarım/spec dokümanları (bkz. not)
```

## 🚀 Hızlı Başlangıç

Ön gereksinim: Node.js ≥ 18, npm ≥ 9.

```bash
# 1) Bağımlılıkları kur + workspace'leri linkle
npm install

# 2) Tüm SDK paketlerini build et (dist/ üretir — örnek app bunları tüketir)
npm run build

# 3) Örnek uygulamayı çalıştır
cd examples/vue-app
npm run dev            # http://localhost:5173
```

Ayrıntı: [examples/vue-app/README.md](examples/vue-app/README.md).

## 🧩 Örnek Uygulama Ne Gösteriyor?

Beş SDK'nın tek bir Vue 3 uygulamasında birlikte çalışması:

- **page-router** → uygulama kabuğu (sidebar + `PageRouterShell`, SDI mod).
- **pseudo-ui** → JSON `ViewDefinition`'ları render eden görünüm motoru (PrimeVue + Aura teması).
- **context-store** → ekranlar arası paylaşılan reaktif state.
- **morph-api** → HTTP/OAuth2 transport.
- **workflow-manager** → amorphie workflow durum-makinesi.

**Bayrak entegrasyon (Clients / Workflow ekranları):** `morph-idm` içindeki her
`client` bir workflow **instance**'ıdır. Uygulama gerçek
`test-vnext-morph-idm` backend'ine bağlanır ve:
- client'ları **listeler** (`queryInstances`),
- **yeni client** açar (`startWorkflow` → draft),
- **statü değiştirir** (`startTransition`; active→passive, draft→publish),
- her adımın **server-driven view'ını** (bir pseudo-ui `ViewDefinition`) render eder;
  transition formları da server-driven'dır.

### Backend & mock kurulumu (Keycloak/Docker gerekmez)

- **Gerçek workflow API'si**: `examples/vue-app/vite.config.ts` içindeki Vite
  proxy `/api/v1` isteklerini `https://test-vnext-morph-idm.apps.nonprod.ebt.bank`
  adresine yönlendirir (self-signed sertifika için `secure:false`). Tarayıcı
  aynı-origin `/api/v1/...` çağırır → CORS sorunu olmaz.
- **Auth**: workflow API'si test'te public'tir ama morph her istekte bir auth
  context'i ister. Bu yüzden bir **client-credentials token'ı MSW ile mock'lanır**
  (`*/idp/token`) ve uygulama açılışında `ensureMorphAuth()` ile önceden alınır;
  backend bu zararsız Bearer'ı yok sayar.
- **Morph API demo ekranı** tamamen MSW ile mock'lanır (`/api/accounts`).

## 🛠️ Geliştirme

```bash
npm run build     # tüm paketleri build et (--workspaces --if-present)
npm run test      # tüm paket testlerini çalıştır
npm run clean
```

Notlar:
- **Build sırası**: `@morph/core` önce; page-router paketleri `packages/tsconfig.base.json`'a bağımlıdır (bu dosya `packages/` kökünde durmalı, yoksa page-router derlemesi kırılır).
- **Build araçları**: morph-api/* ve workflow-manager/* → Vite; page-router/* ve context-store → `tsc`; pseudo-ui → Vite + `vue-tsc`.
- Örnek app, SDK paketlerini `dist/` üzerinden workspace symlink'iyle tüketir; bir SDK'yı değiştirince `npm run build -w <paket>` sonrası app HMR ile yeni dist'i alır (`vite.config.ts` → `optimizeDeps.exclude`).

## 📚 Dokümantasyon

- [docs/RESTRUCTURE.md](docs/RESTRUCTURE.md) — **bu depoda ne yapıldı**: yeniden yapılandırma, Vue-only pseudo-ui, cleanup kayıtları, mimari kararlar.
- [docs/device-identity.md](docs/device-identity.md) — **güncel**: deviceId/installationId + device keypair/token; storage katmanları ve ömürleri (localStorage/sessionStorage, cookie yok).
- [examples/vue-app/README.md](examples/vue-app/README.md) — örnek uygulama.

> **`docs/` içindeki diğer .md dosyaları** (data-manager, navigation, router,
> authantication, workflow-schema, vb.) daha eski **monolitik vNext tasarımına**
> ait spec/tasarım notlarıdır ve mevcut 5-paket yapısıyla birebir örtüşmeyebilir.
> Referans olarak tutuluyorlar; güncel gerçek kaynak = paketlerin kendi kodları
> ve README'leridir.

## 📄 Lisans

Private (paketlerin kendi lisansları için ilgili `package.json`'lara bakın).
