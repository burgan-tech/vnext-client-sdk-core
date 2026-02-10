# Environment Configuration

Uygulama ilk açılışta hangi ortam (stage) ile çalışacağını ve authentication yapılandırmasını belirler.

## Amaç

Environment konfigürasyonu şu temel soruları yanıtlar:

1. **Hangi API'ye bağlanacağım?** → `baseUrl`, `wsUrl`, `mqttUrl`
2. **Kimlik doğrulamayı nasıl yapacağım?** → `authProviders`
3. **Client config'i nereden alacağım?** → `configEndpoint`

## Temel Konseptler

### Multi-Stage Mode

| Mode | Davranış |
|------|----------|
| `never` | Sadece `defaultStage` kullanılır (production için) |
| `onStartup` | Uygulama açılışında stage seçim workflow'u gösterilir |
| `onProfile` | Default ile başlar, profil sayfasından değiştirilebilir |

### Required Token

Her endpoint/workflow için hangi token'ların gerektiğini belirtir. Array sırasına göre öncelik verilir:

```json
"requiredToken": [
  { "provider": "morph-idm-1fa", "token": "access" },
  { "provider": "morph-idm-device", "token": "access" }
]
```

**Mantık:** İlk token varsa onu kullan, yoksa sonrakine bak. `provider` ayrı auth provider key'idir, `token` ise `access` veya `refresh` token tipini belirtir.

### Auth Providers

Unified auth provider modeli — her authentication seviyesi ayrı bir provider olarak tanımlanır:

| Type | Açıklama | Örnek Provider Key |
|------|----------|-------------------|
| `oauth2` | Core framework (morph-idm) | `morph-idm-device`, `morph-idm-1fa`, `morph-idm-2fa` |
| `oauth2` | OAuth2/OIDC external provider | `edevlet` |
| `app2app` | Native app açma | `burgan-yatirim` |
| `webview` | Embedded webview login | `fxtrade` |

> **Not:** morph-idm provider'ları da `oauth2` tipindedir. Amorphie altyapısı OAuth2 protokolü üzerine kuruludur.

### Provider Yapısı ve Token Types

Her provider kendi `grantFlow`, `logout` ve `tokenTypes` konfigürasyonuna sahiptir:

```json
"morph-idm-2fa": {
  "type": "oauth2",
  "grantFlow": {
    "domain": "morph-idm",
    "workflow": "mobile-login"
  },
  "logout": {
    "endpoint": { "domain": "morph-idm", "workflow": "logout" },
    "autoLogoutAtBackground": "5m",
    "autoLogoutAtInactivity": "10m"
  },
  "tokenTypes": {
    "access": {
      "expiry": "5m",
      "storage": { "context": "device", "key": "morph-idm-2fa-access-token" }
    },
    "refresh": {
      "expiry": "30m",
      "endpoint": { "domain": "morph-idm", "workflow": "token", "function": "refresh" },
      "strategy": "rotating",
      "beforeExpiry": "1m",
      "storage": { "context": "device", "key": "morph-idm-2fa-refresh-token" }
    }
  },
  "identityClaims": {
    "user": "act",
    "scope": "sub"
  }
}
```

| Alan | Seviye | Açıklama |
|------|--------|----------|
| `grantFlow` | Provider | Token almak için çalıştırılacak workflow |
| `logout` | Provider | Logout ve auto-logout ayarları |
| `tokenTypes.access` | Token | Access token konfigürasyonu (expiry, storage) |
| `tokenTypes.refresh` | Token | Refresh token konfigürasyonu (expiry, endpoint, strategy, storage) |
| `identityClaims` | Provider | JWT claim → identity mapping (user, scope) |

---

## Uygulama Akışı

```
┌─────────────────────────────────────────────────────────────┐
│  1. Uygulama Başlangıcı                                     │
├─────────────────────────────────────────────────────────────┤
│  GET /discovery/workflows/enviroment/instances/{clientId}/  │
│      functions/enviroments                                  │
│                                                             │
│  → Environment config alınır (stages, authProviders)        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Stage Seçimi (multiStageMode'a göre)                    │
├─────────────────────────────────────────────────────────────┤
│  • never → defaultStage kullanılır                          │
│  • onStartup → selector-workflow çalıştırılır               │
│  • onProfile → defaultStage, sonra değiştirilebilir         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Device Token Alma                                       │
├─────────────────────────────────────────────────────────────┤
│  morph-idm-device.grantFlow workflow çalıştırılır            │
│  → Device token alınır (infinite expiry)                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Client Config Alma                                      │
├─────────────────────────────────────────────────────────────┤
│  configEndpoint çağrılır (device token ile)                 │
│  → initialization, deepLinking, realtime config alınır      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Login (gerekirse)                                       │
├─────────────────────────────────────────────────────────────┤
│  morph-idm-2fa.grantFlow workflow çalıştırılır               │
│  → 1FA + 2FA token alınır                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Endpoint

### Function Endpoint (Client Kullanır ✅)

Client'a özel, sadece gerekli environment konfigürasyonunu döner.

```http
GET {{baseUrl}}/discovery/workflows/enviroment/instances/{{clientId}}/functions/enviroments
```

### Instance Data (Kullanılmaz ❌)

Tüm instance verisini döner. Client için gereksiz veri içerir.

```http
GET {{baseUrl}}/discovery/workflows/enviroment/instances/{{clientId}}/data
```

> **Not:** `clientId` ve `baseUrl` uygulama içinde hardcode edilmiştir. Bu iki değer dışında tüm konfigürasyon backend'den gelir.

---

## Dosyalar

| Dosya | Açıklama |
|-------|----------|
| [environments.master.json](./schemas/environments.master.json) | JSON Schema |
| [environments-tester.json](./samples/environments-tester.json) | Test ortamı örneği (multi-stage) |
| [environments-production.json](./samples/environments-production.json) | Production örneği (tek stage) |
