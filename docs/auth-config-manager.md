# Auth Config Manager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar adapter katmanında gerçekleştirilir.

AuthConfigManager, environment'ten gelen authentication configuration'ı parse eden, token lifecycle'ını yöneten ve token seçim mantığını uygulayan core SDK sınıfıdır. DataManager ve Router gibi **non-visual** bir component'tir.

## 🎯 Temel Amaç

Environment configuration'dan gelen `authProviders` yapılandırmasını parse edip, token'ların yaşam döngüsünü (grant, refresh, expiry, logout) yönetmek ve API çağrıları için doğru token'ı seçmektir.

**Lifecycle Entegrasyonu:**
- AuthConfigManager, environment config alındıktan sonra initialize edilir (lifecycle.md - step 200: Environment.Config.Loaded)
- Config'den `authProviders` array'i parse edilir ve her provider için token type'ları yönetilir
- Device token grant flow'u otomatik başlatılır (step 300: Auth-Manager.Init)
- Token refresh ve auto-logout mekanizmaları background'da çalışır

## 🚀 Temel Sunduğu Hizmetler

* **Configuration Parsing**: Environment'ten gelen `authProviders` config'ini parse eder ve normalize eder
* **Token Lifecycle Management**: Token'ların grant, refresh, expiry ve logout süreçlerini yönetir
* **Token Selection Logic**: `requiredToken` array'ine göre hangi token'ın kullanılacağını belirler
* **Token Storage Management**: Token'ları DataManager'a uygun context'te saklar (device, user, secureMemory)
* **Grant Flow Integration**: WorkflowManager ile entegre çalışarak token grant flow'larını başlatır
* **Auto-Refresh Mechanism**: Token expiry'den önce otomatik refresh yapar
* **Auto-Logout Mechanism**: Background/inactivity timeout'lara göre otomatik logout yapar
* **Token Validation**: Token expiry ve validity kontrolü yapar

## 📋 Auth Provider Configuration

Environment config'den gelen `authProviders` array'i parse edilir. Her provider şu yapıda olabilir:

### Provider Types

| Type | Açıklama | Örnek |
|------|----------|-------|
| `native` | Core framework (morph-idm) | device, 1fa, 2fa token'ları |
| `oauth2` | OAuth2/OIDC provider | e-devlet, Google |
| `app2app` | Native app açma | Burgan Yatırım |
| `webview` | Embedded webview login | FXTrade |

### Token Types Configuration

Her provider'ın `tokenTypes` objesi içinde token tipi tanımları bulunur:

```json
{
  "key": "morph-idm",
  "type": "native",
  "tokenTypes": {
    "device": {
      "expiry": "infinite",
      "grantFlow": {
        "runtime": "v2",
        "domain": "morph-idm",
        "workflow": "device-login",
        "requiredToken": []
      },
      "refresh": null,
      "logout": null
    },
    "2fa": {
      "expiry": "5m",
      "grantFlow": {
        "runtime": "v2",
        "domain": "morph-idm",
        "workflow": "mobile-login",
        "requiredToken": [
          { "provider": "morph-idm", "token": "1fa" },
          { "provider": "morph-idm", "token": "device" }
        ]
      },
      "refresh": {
        "endpoint": "/auth/token/refresh",
        "strategy": "rotating",
        "beforeExpiry": "1m"
      },
      "logout": {
        "endpoint": "/auth/logout",
        "autoLogoutAtBackground": "5m",
        "autoLogoutAtInactivity": "15m"
      }
    }
  }
}
```

### Token Type Fields

| Alan | Tip | Açıklama |
|------|-----|----------|
| `expiry` | `string \| "infinite"` | Token geçerlilik süresi (örn: "5m", "90d", "1h") veya "infinite" |
| `grantFlow` | `object \| null` | Token almak için çalıştırılacak workflow config (null ise otomatik alınır) |
| `refresh` | `object \| null` | Token yenileme ayarları (null ise refresh yok) |
| `logout` | `object \| null` | Logout ve auto-logout ayarları (null ise logout endpoint yok) |

### Grant Flow Structure

```json
{
  "runtime": "v2",
  "domain": "morph-idm",
  "workflow": "device-login",
  "requiredToken": [
    { "provider": "morph-idm", "token": "device" }
  ]
}
```

### Refresh Configuration

```json
{
  "endpoint": "/auth/token/refresh",
  "strategy": "rotating",
  "beforeExpiry": "1m"
}
```

| Alan | Açıklama |
|------|----------|
| `endpoint` | Refresh endpoint path'i |
| `strategy` | `"rotating"` (yeni token döner) veya `"extend"` (mevcut token extend edilir) |
| `beforeExpiry` | Token expire olmadan kaç süre önce refresh yapılacağı |

### Logout Configuration

```json
{
  "endpoint": "/auth/logout",
  "autoLogoutAtBackground": "5m",
  "autoLogoutAtInactivity": "15m"
}
```

| Alan | Açıklama |
|------|----------|
| `endpoint` | Logout endpoint path'i |
| `autoLogoutAtBackground` | App background'a geçtiğinde kaç süre sonra logout (null ise disable) |
| `autoLogoutAtInactivity` | Kullanıcı inactivity'de kaç süre sonra logout (null ise disable) |

## 🔄 Token Lifecycle Management

AuthConfigManager, her token tipi için lifecycle'ı yönetir:

### 1. Token Grant (İlk Alma)

Token'ın ilk kez alınması:

1. **Grant Flow Varsa**: `grantFlow.workflow` çalıştırılır (WorkflowManager ile)
   - `requiredToken` array'i kontrol edilir, gerekli token'lar yoksa önce onlar alınır
   - Workflow tamamlandığında token response'dan alınır
2. **Grant Flow Yoksa**: Token otomatik alınır (provider'a göre)
   - Native: Device register endpoint'i
   - OAuth2: Authorization code flow
   - App2App: Native app açma
   - Webview: Embedded webview login

**Token Storage:**
- Token, DataManager'a uygun context'te saklanır (config'den belirlenir)
- Token metadata (expiry, provider, type) ile birlikte saklanır

### 2. Token Refresh

Token expiry'den önce otomatik refresh:

1. **Refresh Config Varsa**: `beforeExpiry` süresinden önce refresh yapılır
2. **Refresh Endpoint**: `refresh.endpoint` çağrılır
3. **Strategy**:
   - `rotating`: Yeni token döner, eski token invalid olur
   - `extend`: Mevcut token'ın expiry'si extend edilir
4. **Refresh Başarılı**: Yeni token DataManager'a yazılır
5. **Refresh Başarısız**: Token temizlenir, logout durumuna geçilir

**Refresh Timer:**
- Her token için ayrı timer yönetilir
- Token expiry'den `beforeExpiry` süre önce refresh başlatılır
- Refresh başarılı olursa timer yeniden hesaplanır

### 3. Token Expiry

Token expire olduğunda:

1. **Expiry Kontrolü**: Her API çağrısı öncesi token expiry kontrol edilir
2. **Expired Token**: Token expire olmuşsa:
   - Refresh config varsa refresh denenir
   - Refresh başarısızsa veya config yoksa token temizlenir
   - `auth.tokenExpired` event'i emit edilir
3. **Infinite Token**: `expiry: "infinite"` olan token'lar expire olmaz

### 4. Token Logout

Token logout işlemi:

1. **Manual Logout**: `logout()` metodu çağrıldığında
   - `logout.endpoint` varsa endpoint çağrılır
   - Token DataManager'dan silinir
   - `auth.loggedOut` event'i emit edilir

2. **Auto-Logout (Background)**:
   - App background'a geçtiğinde timer başlatılır
   - `autoLogoutAtBackground` süresi dolunca logout yapılır
   - App foreground'a dönünce timer iptal edilir

3. **Auto-Logout (Inactivity)**:
   - Kullanıcı etkileşimi yoksa timer başlatılır
   - `autoLogoutAtInactivity` süresi dolunca logout yapılır
   - Kullanıcı etkileşimi olunca timer reset edilir

## 🎯 Token Selection Logic

API çağrıları için hangi token'ın kullanılacağı `requiredToken` array'ine göre belirlenir:

### Required Token Array

```json
"requiredToken": [
  { "provider": "morph-idm", "token": "2fa" },
  { "provider": "morph-idm", "token": "1fa" },
  { "provider": "morph-idm", "token": "device" }
]
```

**Mantık:**
1. Array sırasına göre token kontrol edilir
2. İlk mevcut ve geçerli token kullanılır
3. Hiçbiri yoksa token grant flow'u başlatılır (ilk token için)

**Örnek Senaryo:**

| Durum | 2FA Token | 1FA Token | Device Token | Seçilen Token |
|-------|-----------|-----------|--------------|---------------|
| Senaryo 1 | ✅ Geçerli | ✅ Geçerli | ✅ Geçerli | **2FA** (ilk sırada) |
| Senaryo 2 | ❌ Yok | ✅ Geçerli | ✅ Geçerli | **1FA** (ikinci sırada) |
| Senaryo 3 | ❌ Expired | ❌ Yok | ✅ Geçerli | **Device** (üçüncü sırada) |
| Senaryo 4 | ❌ Yok | ❌ Yok | ❌ Yok | **Device Grant Flow** başlatılır |

### Token Selection API

```typescript
// Belirli bir requiredToken için token seç
const token = await authConfigManager.selectToken([
  { provider: "morph-idm", token: "2fa" },
  { provider: "morph-idm", token: "1fa" }
]);

// Token yoksa veya expired ise null döner
// Token yoksa ve grantFlow varsa otomatik grant başlatılır
```

## 💾 Token Storage Management

Token'lar DataManager'a uygun context'te saklanır. Context mapping config'den belirlenir:

### Token Context Mapping

| Token | Context | Açıklama |
|-------|---------|----------|
| Device Token | `device` | Bootstrap için, şifresiz ama sadece device tanımlama |
| 1FA Token | `user` | Uzun ömürlü (90d), şifreli persist gerekli |
| 2FA Token | `secureMemory` | Kısa ömürlü (5m), volatile yeterli |
| OAuth2 Access Token | `secureMemory` | Kısa ömürlü, volatile |
| OAuth2 Refresh Token | `user` | Şifreli persist gerekli |

**Storage Key Format:**
```
auth.token.{provider}.{tokenType}
```

**Örnek:**
- `auth.token.morph-idm.device`
- `auth.token.morph-idm.1fa`
- `auth.token.morph-idm.2fa`
- `auth.token.edevlet.access`
- `auth.token.edevlet.refresh`

### Token Metadata

Token ile birlikte metadata da saklanır:

```typescript
interface TokenMetadata {
  provider: string;
  tokenType: string;
  expiresAt: number | null; // null if infinite
  issuedAt: number;
  refreshConfig?: RefreshConfig;
  logoutConfig?: LogoutConfig;
}
```

## 🔗 Integration with Other Managers

### WorkflowManager Integration

Grant flow'ları başlatmak için:

```typescript
// Grant flow başlat
const workflowInstance = await workflowManager.startWorkflow({
  domain: grantFlow.domain,
  workflow: grantFlow.workflow,
  requiredToken: grantFlow.requiredToken
});

// Workflow tamamlandığında token response'dan alınır
const token = workflowInstance.result.token;
```

### DataManager Integration

Token'ları saklamak ve okumak için:

```typescript
// Token kaydet
await dataManager.set('auth.token.morph-idm.2fa', token, {
  context: 'secureMemory',
  ttl: 5 * 60 * 1000 // 5 dakika
});

// Token oku
const token = await dataManager.get('auth.token.morph-idm.2fa', {
  context: 'secureMemory'
});
```

### ApiClient Integration

API çağrıları için token injection:

```typescript
// Request interceptor'da token seç ve header'a ekle
const token = await authConfigManager.selectToken(requiredToken);
if (token) {
  request.headers['Authorization'] = `Bearer ${token.accessToken}`;
}
```

## ⚡ Event System

AuthConfigManager aşağıdaki event'leri emit eder:

| Event | Payload | Açıklama |
|-------|---------|----------|
| `token.granted` | `{ provider, tokenType, token }` | Token başarıyla alındığında |
| `token.grantFailed` | `{ provider, tokenType, error }` | Token alma başarısız olduğunda |
| `token.refreshed` | `{ provider, tokenType, token }` | Token refresh başarılı olduğunda |
| `token.refreshFailed` | `{ provider, tokenType, error }` | Token refresh başarısız olduğunda |
| `token.expired` | `{ provider, tokenType }` | Token expire olduğunda |
| `token.loggedOut` | `{ provider, tokenType }` | Token logout yapıldığında |
| `token.autoLogout` | `{ provider, tokenType, reason }` | Auto-logout tetiklendiğinde |

**Event Subscription:**

```typescript
// Event dinle
authConfigManager.on('token.granted', (payload) => {
  console.log('Token granted:', payload);
});

// Event unsubscribe
const unsubscribe = authConfigManager.on('token.expired', handler);
unsubscribe();
```

## 🔄 Auto-Refresh Mechanism

Token expiry'den önce otomatik refresh:

1. **Timer Setup**: Token alındığında veya refresh edildiğinde timer kurulur
2. **Refresh Time**: `expiresAt - beforeExpiry` zamanında refresh başlatılır
3. **Background Refresh**: App background'da da refresh çalışır (config'e göre)
4. **Refresh Success**: Yeni token kaydedilir, timer yeniden kurulur
5. **Refresh Failure**: Token temizlenir, `token.refreshFailed` event'i emit edilir

**Örnek:**
- Token expiry: `2024-01-01 12:00:00`
- `beforeExpiry`: `1m`
- Refresh time: `2024-01-01 11:59:00`

## 🚪 Auto-Logout Mechanism

### Background Auto-Logout

App background'a geçtiğinde:

1. **Background Timer**: `autoLogoutAtBackground` süresi için timer başlatılır
2. **Foreground Return**: App foreground'a dönünce timer iptal edilir
3. **Timeout**: Süre dolunca logout yapılır, `token.autoLogout` event'i emit edilir

### Inactivity Auto-Logout

Kullanıcı etkileşimi yoksa:

1. **Activity Tracking**: Kullanıcı etkileşimleri (touch, click, scroll) track edilir
2. **Inactivity Timer**: Her etkileşimde timer reset edilir
3. **Timeout**: `autoLogoutAtInactivity` süresi dolunca logout yapılır

**Activity Events:**
- Touch/Click events
- Scroll events
- Keyboard events
- Focus events

## 📝 Configuration Example

Tam bir auth provider configuration örneği:

```json
{
  "authProviders": [
    {
      "key": "morph-idm",
      "type": "native",
      "tokenTypes": {
        "device": {
          "expiry": "infinite",
          "grantFlow": {
            "runtime": "v2",
            "domain": "morph-idm",
            "workflow": "device-login",
            "requiredToken": []
          },
          "refresh": null,
          "logout": null
        },
        "1fa": {
          "expiry": "90d",
          "grantFlow": null,
          "refresh": null,
          "logout": {
            "endpoint": "/auth/logout/1fa"
          }
        },
        "2fa": {
          "expiry": "5m",
          "grantFlow": {
            "runtime": "v2",
            "domain": "morph-idm",
            "workflow": "mobile-login",
            "requiredToken": [
              { "provider": "morph-idm", "token": "1fa" },
              { "provider": "morph-idm", "token": "device" }
            ]
          },
          "refresh": {
            "endpoint": "/auth/token/refresh",
            "strategy": "rotating",
            "beforeExpiry": "1m"
          },
          "logout": {
            "endpoint": "/auth/logout",
            "autoLogoutAtBackground": "5m",
            "autoLogoutAtInactivity": "15m"
          }
        }
      }
    },
    {
      "key": "edevlet",
      "type": "oauth2",
      "authorizationUrl": "https://giris.turkiye.gov.tr/OAuth2/authorize",
      "tokenUrl": "https://giris.turkiye.gov.tr/OAuth2/token",
      "clientId": "{{clientId}}",
      "scopes": ["profile", "tcno"],
      "pkce": true,
      "tokenTypes": {
        "access": {
          "expiry": "1h"
        },
        "refresh": {
          "expiry": "7d"
        }
      },
      "tokenExchange": {
        "endpoint": "/auth/exchange/edevlet"
      }
    }
  ]
}
```

## 🔐 Security Considerations

1. **Token Storage**: Token'lar uygun context'te saklanır (secureMemory, user context şifreli)
2. **Token Expiry**: Expired token'lar otomatik temizlenir
3. **Auto-Logout**: Background/inactivity timeout'lar güvenlik için kritik
4. **Refresh Strategy**: Rotating strategy ile eski token'lar invalid olur
5. **Grant Flow Security**: Grant flow'lar WorkflowManager ile güvenli şekilde yönetilir

## 🎯 Usage Examples

### Initialize AuthConfigManager

```typescript
// Environment config'den authProviders alınır
const environmentConfig = await fetchEnvironmentConfig();
const authProviders = environmentConfig.stages[0].authProviders;

// AuthConfigManager initialize edilir
const authConfigManager = new AuthConfigManager({
  authProviders,
  dataManager,
  workflowManager,
  apiClient
});
```

### Get Token for API Call

```typescript
// API çağrısı için token seç
const requiredToken = [
  { provider: "morph-idm", token: "2fa" },
  { provider: "morph-idm", token: "1fa" }
];

const token = await authConfigManager.selectToken(requiredToken);
if (token) {
  // Token kullan
  const response = await apiClient.get('/api/data', {
    headers: {
      'Authorization': `Bearer ${token.accessToken}`
    }
  });
}
```

### Manual Token Grant

```typescript
// Belirli bir token'ı manuel olarak al
const token = await authConfigManager.grantToken(
  'morph-idm',
  '2fa'
);
```

### Manual Logout

```typescript
// Belirli bir token'ı logout yap
await authConfigManager.logout('morph-idm', '2fa');
```

### Listen to Events

```typescript
// Token event'lerini dinle
authConfigManager.on('token.granted', (payload) => {
  console.log('Token granted:', payload.provider, payload.tokenType);
});

authConfigManager.on('token.expired', (payload) => {
  console.log('Token expired:', payload.provider, payload.tokenType);
  // Kullanıcıyı login sayfasına yönlendir
});
```
