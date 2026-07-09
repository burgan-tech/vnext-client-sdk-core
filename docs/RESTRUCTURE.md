# Yeniden Yapılandırma & Cleanup — Kayıt

Bu doküman, deponun eski monolitik `@vnext/*` iskeletinden, beş bağımsız vNext
client SDK'sının TS paketlerini barındıran bir monorepo'ya nasıl dönüştürüldüğünü
ve yapılan sadeleştirmeleri kayıt altına alır.

## 1. Hedef & kapsam

- SDK'ları **yalnızca vNext seviyesinde** uyumlu tut.
- **Kapsam dışı**: Flutter/Dart, Angular, React. (Web/Vue tek hedef.)
- Beş SDK'nın **TS core + Vue adaptörlerini** bu depoya al, hepsini kullanan tek
  bir örnek Vue uygulaması ayağa kaldır.

## 2. Kaynak repolar → paketler

TS paketleri şu upstream repolardan kopyalandı (paketlerin **orijinal npm
isimleri korundu** — paketler arası `peerDependency` bağları isimle çözülüyor):

| Upstream repo | Alınan paketler → hedef |
|---|---|
| `burgan-tech/morph-api-client` | `@morph/core`, `oauth2`, `logger`, `browser-storage` → `packages/morph-api/*` |
| `burgan-tech/vnext-client-view-renderer` | `@burgan-tech/pseudo-ui` → `packages/pseudo-ui` |
| `burgan-tech/vnext-client-page-router` | `page-router`, `page-router-vue` → `packages/page-router/{core,vue}` |
| `burgan-tech/vnext-client-data-manager` | `@burgantech/context-store` → `packages/context-store` |
| `burgan-tech/vnext-client-workflow-manager` | `amorphie-workflow-manager` (+vue) → `packages/workflow-manager/{core,vue}` |

Kopyalanmayanlar: `node_modules`, `dist`, `.git`, lockfile'lar, diğer framework
sample'ları (Angular/React), Dart paketleri.

## 3. Silinen eski iskelet

`core/core-ts` (`@vnext/core-ts`), `core/core-flutter`, `adapters/vue`
(`@vnext/vue`), eski `examples/vue-app`, eski `mocks/` tamamen kaldırıldı. Root
`package.json` workspaces `packages/**` + `examples/*` olarak yeniden yazıldı.

## 4. pseudo-ui → Vue-only

`@burgan-tech/pseudo-ui` çok-framework'lü bir pakettir; Vue dışındaki her şey
çıkarıldı:
- `src/adapters/angular`, `src/adapters/react`, `src/public-api.angular.ts` silindi.
- `package.json`: `exports`'tan angular/react alt-yolları, Angular/React
  peerDependencies + devDependencies, `build:angular`/react tsc/CSS adımları çıkarıldı.
- `vite.config.ts` / `vitest.config.ts`: React plugin ve React entry'leri kaldırıldı;
  `tsconfig.angular.json`, `tsconfig.react.json`, `ng-package.angular.json` silindi.
- React/Angular test dosyaları silindi.
- `vocabularies/*.json` paket içine taşındı (build script'i eski repo kökü yolunu arıyordu).

Engine (`src/engine/*`) ve Vue adaptörü zaten framework-agnostic'ti; "Flutter"
geçen yerler yalnızca yorum seviyesindeydi (çalışan Flutter kodu yoktu).

## 5. Cleanup — "gözü kapalı" (ölü kod / kopya) grubu

Aşağıdakiler kaldırıldı; her paket sonrası **build + test** yeşil doğrulandı
(toplam 652 test geçiyor):

**pseudo-ui**
- `src/engine/theme/*` (colorPalette, colorUtils, jsonPalette, paletteToCssVars)
  + `tests/engine/theme/*` + `engine/index.ts` re-export bloğu — Dart SDK'sının
  1:1 portu, Vue renderer hiç kullanmıyordu (tema PrimeVue'ya devredilmiş).
- `docs/ARCHITECTURE-REVIEW.md` — Flutter-port planlama dokümanı.
- (Ek düzeltme) `componentMeta` testindeki vocabulary yolu paket-yereline çekildi.

**page-router**
- `page-router.ts` içindeki ölü `void this.*` iskele bloğu (alanlar artık gerçekten
  kullanılıyor). `defaultShellModeOnConflict` (henüz uygulanmamış
  `ShellModeConflictPolicy`) için tek `void` satırı yorumla korundu.

**workflow-manager**
- Sıfır-referanslı ölü kod: `StateManager.patch`, `StateManager.setStatus`,
  `WorkflowStateProcessor.enrichFromEnvelope`, `SchemaManager.peek`, `pickBodyFilter`
  (+ artık gereksiz importlar).
- Vue `triggerRef` savunma dalına dokunulmadı (reaktivite riski).

**morph-api / oauth2**
- `@morph/core` ile birebir aynı 4 kopya util (oauthAuthorize, oauthReturn,
  oauthState, normalizeOrigin) silindi; `index.ts` aynı sembolleri doğrudan
  `@morph/core`'dan re-export ediyor.

### Henüz yapılmayan cleanup (onay bekliyor)

- **Wire-format çift-desteği** (workflow-manager): eski amorphie formatını da parse
  eden dallar — status tam-isim (`active`/`busy`/…), numeric `stateType` (1–5),
  transition `name ?? key`, `transitionId ?? transitionKey`, snapshot root-fallback,
  ETag body/lowercase fallback, view `content.url` vs `href`. → Backend'in artık
  sadece yeni format gönderdiği teyit edilince silinebilir.
- **Public API / eski veri riski**: pseudo-ui `onTap` (deprecated Card alias),
  `Storage.localStorage` (context-store; `secureStorage` ile aynı davranış),
  `InteractionMode` `'redirect'` (morph, kullanılmıyor), `exchangeSources` "legacy
  single string" formu.
- **Yarım özellikler (sil ya da tamamla)**: `ShellModeConflictPolicy`
  (page-router; deklare edilmiş, navigate'te uygulanmamış), dormant schema-filter
  cluster (workflow-manager `SchemaManager`→`SchemaBasedBodyFilter` hiç bağlı değil),
  `platform` opsiyonu (workflow-manager; alınıyor, kullanılmıyor).
- context-store `crypto.ts` XOR "şifreleme" — placeholder, prod'da AES-256-GCM olmalı.

## 6. Önemli kararlar & tuzaklar

- **Paket isimleri korundu** (`@morph/*`, `page-router`, `amorphie-workflow-manager`
  …). Birleştirme (`@vnext/*`) ileride ayrı bir iş olarak yapılabilir.
- **`packages/tsconfig.base.json`** `packages/` kökünde durmalı — page-router
  tsconfig'leri `../../tsconfig.base.json` ile buna erişir; eksikse tsc default'lara
  düşüp sahte "narrowing" hataları üretir.
- **`startTransition.body` ham attributes objesidir** — SDK bunu `{attributes: body}`
  olarak sarar; **çift-sarma yapma**.
- Gerçek `test-vnext-morph-idm` backend'i **CORS göndermez** ve **self-signed
  sertifika** kullanır → tarayıcıdan doğrudan çağrılamaz; Vite proxy (`secure:false`)
  üzerinden aynı-origin çağrılır.
- Verilen `test-morph-idm-api.burgan.com.tr` swagger'ı ayrı bir küçük **"IdmUtils
  API"**dır (RSA yardımcıları), client/workflow API'si değildir.

## 7. Doğrulama durumu

- Tüm paketler build oluyor; **652 test geçiyor**, 0 hata.
- Örnek app typecheck + build temiz; dev server serve ediyor; gerçek backend proxy'si
  (state/view/list) çalışıyor.
- Tarayıcı-içi uçtan uca akış (MSW token + canlı pseudo-ui render) manuel olarak
  doğrulandı.
