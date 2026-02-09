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
  { "provider": "morph-idm", "token": "1fa" },
  { "provider": "morph-idm", "token": "device" }
]
```

**Mantık:** İlk token varsa onu kullan, yoksa sonrakine bak.

### Auth Providers

Unified auth provider modeli - tüm provider'lar aynı yapıda:

| Type | Açıklama | Örnek |
|------|----------|-------|
| `native` | Core framework (morph-idm) | device, 1fa, 2fa token'ları |
| `oauth2` | OAuth2/OIDC provider | e-devlet, Google |
| `app2app` | Native app açma | Burgan Yatırım |
| `webview` | Embedded webview login | FXTrade |

### Token Types ve Grant Flow

Her token tipinin kendi yaşam döngüsü vardır:

```json
"tokenTypes": {
  "device": {
    "expiry": "infinite",
    "grantFlow": { "workflow": "device-login", "requiredToken": [] },
    "refresh": null,
    "logout": null
  },
  "2fa": {
    "expiry": "5m",
    "grantFlow": { "workflow": "mobile-login", "requiredToken": [...] },
    "refresh": { "endpoint": "/auth/token/refresh", "strategy": "rotating" },
    "logout": { "endpoint": "/auth/logout", "autoLogoutAtBackground": "5m" }
  }
}
```

| Alan | Açıklama |
|------|----------|
| `expiry` | Token geçerlilik süresi |
| `grantFlow` | Token almak için çalıştırılacak workflow (null ise otomatik alınır) |
| `refresh` | Token yenileme ayarları |
| `logout` | Logout ve auto-logout ayarları |

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
│  device.grantFlow.workflow çalıştırılır                     │
│  → Device token alınır (infinite expiry)                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Client Config Alma                                      │
├─────────────────────────────────────────────────────────────┤
│  configEndpoint çağrılır (device token ile)                 │
│  → initialization, features, realtime config alınır         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Login (gerekirse)                                       │
├─────────────────────────────────────────────────────────────┤
│  2fa.grantFlow.workflow çalıştırılır                        │
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
