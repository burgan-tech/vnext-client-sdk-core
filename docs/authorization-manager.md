# Authorization Manager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar adapter katmanında gerçekleştirilir.

AuthorizationManager, environment'ten gelen authentication configuration'ı parse eden, token lifecycle'ını yöneten ve token seçim mantığını uygulayan core SDK sınıfıdır. DataManager ve Router gibi **non-visual** bir component'tir.

## 🎯 Temel Amaç

Environment configuration'dan gelen `authProviders` yapılandırmasını parse edip, token'ların yaşam döngüsünü (grant, refresh, expiry, logout) yönetmek ve API çağrıları için doğru token'ı seçmektir.

**Lifecycle Entegrasyonu:**
- AuthorizationManager, environment config alındıktan sonra initialize edilir (lifecycle.md - step 200: Environment.Config.Loaded)
- Config'den `authProviders` array'i parse edilir ve her provider için token type'ları yönetilir
- Device token grant flow'u otomatik başlatılır (step 300: Auth-Manager.Init)
- Token refresh ve auto-logout mekanizmaları background'da çalışır

## 🚀 Temel Sunduğu Hizmetler

* **Configuration Parsing**: Environment'ten gelen `authProviders` config'ini parse eder ve normalize eder
* **Token Lifecycle Management**: Token'ların grant, refresh, expiry ve logout süreçlerini yönetir
* **Token Selection Logic**: `requiredToken` array'ine göre hangi token'ın kullanılacağını belirler
* **Token Storage Management**: Token'ları DataManager'a uygun context'te saklar (device, user, secureMemory)
* **Grant Flow Integration**: WorkflowManager ile entegre çalışarak token grant flow'larını başlatır
* **Auto-Refresh Mechanism**: Refresh token config'ine göre access token expire olmadan önce otomatik refresh yapar
* **Auto-Logout Mechanism**: Background/inactivity timeout'lara göre otomatik logout yapar
* **Token Validation**: Token expiry ve validity kontrolü yapar

## 📋 Auth Provider Configuration

Environment config'den gelen `authProviders` array'i parse edilir. Her auth seviyesi ayrı bir provider olarak tanımlanır.

> **Önemli:** Tüm provider'lar OAuth2 tabanlıdır (`type: "oauth2"`). Grant mekanizması farklılaşır: Amorphie workflow (`grantFlow`), standart OAuth2 flow (`authorizationUrl`, `tokenUrl`), app2app (`scheme`), webview (`url`).

### Provider Yapısı

Bir auth provider şu bölümlerden oluşur:

| Alan | Seviye | Açıklama |
|------|--------|----------|
| `key` | Provider kökü | Provider benzersiz tanımlayıcısı |
| `type` | Provider kökü | Protokol tipi (her zaman `"oauth2"`) |
| `grantFlow` | Provider kökü | Token almak için çalıştırılacak workflow |
| `logout` | Provider kökü | Logout ve auto-logout ayarları (tüm token'ları temizler) |
| `tokenTypes` | Provider kökü | Token tanımları (`access`, opsiyonel `refresh`) |
| `tokenTypes.access` | Token entry | Access token: `expiry`, `storage` |
| `tokenTypes.refresh` | Token entry | Refresh token: `expiry`, `endpoint`, `strategy`, `beforeExpiry`, `storage` |

### Grant Mekanizmaları

Grant mekanizması provider'daki alanlara göre belirlenir:

| Grant Mekanizması | Ayrıştırıcı Alanlar | Örnek |
|-------------------|---------------------|-------|
| Amorphie Workflow | `grantFlow` | morph-idm-device, morph-idm-2fa |
| Otomatik (login sonucu gelir) | `grantFlow` yok | morph-idm-1fa |
| OAuth2 Authorization Code | `authorizationUrl`, `tokenUrl`, `pkce`, `scopes` | edevlet |
| App2App (native app açma) | `scheme`, `callbackScheme`, `fallbackUrl` | burgan-yatirim |
| Webview (embedded login) | `url`, `callbackPattern` | fxtrade |

### Token Types

Her provider `tokenTypes` objesi içinde iki olası entry içerir:

| Token Type | Zorunlu | Açıklama |
|------------|---------|----------|
| `access` | ✅ Evet | Kısa ömürlü erişim token'ı. `expiry` ve `storage` içerir. |
| `refresh` | ❌ Hayır | Uzun ömürlü yenileme token'ı. Access token'ı yenilemek için kullanılır. `expiry`, `endpoint`, `strategy`, `beforeExpiry` ve `storage` içerir. |

#### Access Token Fields

| Alan | Tip | Açıklama |
|------|-----|----------|
| `expiry` | `string` | Token geçerlilik süresi (örn: `"5m"`, `"90d"`, `"1h"`, `"infinite"`) |
| `storage` | `object` | DataManager'da hangi context ve key'de saklanacağı |

#### Refresh Token Fields

| Alan | Tip | Açıklama |
|------|-----|----------|
| `expiry` | `string` | Refresh token geçerlilik süresi (örn: `"30d"`, `"7d"`) |
| `endpoint` | `string` | Refresh endpoint path'i |
| `strategy` | `"rotating" \| "extend"` | `"rotating"`: Yeni access + refresh token döner. `"extend"`: Mevcut token extend edilir. |
| `beforeExpiry` | `string` | Access token expire olmadan ne kadar önce refresh yapılır (örn: `"1m"`, `"5m"`) |
| `storage` | `object` | DataManager'da hangi context ve key'de saklanacağı |

### Logout Configuration

Logout provider kökünde tanımlanır ve provider'ın tüm token'larını temizler:

```json
{
  "logout": {
    "endpoint": "/auth/logout",
    "autoLogoutAtBackground": "5m",
    "autoLogoutAtInactivity": "15m"
  }
}
```

| Alan | Açıklama |
|------|----------|
| `endpoint` | Backend logout endpoint path'i |
| `autoLogoutAtBackground` | App background'a geçtiğinde kaç süre sonra logout (belirtilmezse disable) |
| `autoLogoutAtInactivity` | Kullanıcı inactivity'de kaç süre sonra logout (belirtilmezse disable) |

### Grant Flow Structure

Grant flow provider kökünde tanımlanır:

```json
{
  "grantFlow": {
    "runtime": "v2",
    "domain": "morph-idm",
    "workflow": "mobile-login",
    "requiredToken": [
      { "provider": "morph-idm-1fa", "token": "access" },
      { "provider": "morph-idm-device", "token": "access" }
    ]
  }
}
```

| Alan | Açıklama |
|------|----------|
| `runtime` | Workflow runtime versiyonu |
| `domain` | Workflow domain'i |
| `workflow` | Workflow adı |
| `requiredToken` | Bu akışı başlatmak için gerekli token'lar (öncelik sırasına göre) |

### Token Storage

Her token kendi storage bilgisini içerir:

```json
{
  "storage": {
    "context": "secureMemory",
    "key": "auth.token.morph-idm-2fa.access"
  }
}
```

| Context | Açıklama |
|---------|----------|
| `device` | Secure Storage (şifresiz - bootstrap). Device token'ları için. |
| `user` | Secure Storage + Encrypted. Uzun ömürlü token'lar (1FA access, refresh token'lar) için. |
| `secureMemory` | In-Memory ONLY. Kısa ömürlü, volatile token'lar (2FA access, OAuth2 access) için. |

## 🔄 Token Lifecycle Management

AuthorizationManager, her provider için lifecycle'ı yönetir:

### 1. Token Grant (İlk Alma)

Token'ın ilk kez alınması:

1. **Grant Flow Varsa** (`grantFlow` provider kökünde): WorkflowManager ile workflow çalıştırılır
   - `requiredToken` array'i kontrol edilir, gerekli token'lar yoksa önce onlar alınır
   - Workflow tamamlandığında access token (ve varsa refresh token) response'dan alınır
2. **Grant Flow Yoksa**: Grant mekanizması provider'daki diğer alanlarla belirlenir
   - `authorizationUrl` varsa → OAuth2 Authorization Code flow
   - `scheme` varsa → App2App native app açma
   - `url` varsa → Webview embedded login
   - Hiçbiri yoksa → Token otomatik alınır (login workflow'undan gelir)

**Token Storage:**
- Access token → `tokenTypes.access.storage` config'ine göre DataManager'a kaydedilir
- Refresh token (varsa) → `tokenTypes.refresh.storage` config'ine göre DataManager'a kaydedilir

### 2. Token Refresh

Access token expire olmadan önce otomatik refresh (sadece `tokenTypes.refresh` tanımlıysa):

1. Refresh timer, `tokenTypes.refresh.beforeExpiry` süresine göre kurulur
2. Timer dolunca `tokenTypes.refresh.endpoint` çağrılır (refresh token gönderilir)
3. **Strategy**:
   - `rotating`: Yeni access + refresh token döner, eski token'lar invalid olur
   - `extend`: Mevcut access token'ın expiry'si extend edilir
4. **Refresh Başarılı**: 
   - Yeni access token → `tokenTypes.access.storage` key'ine yazılır
   - Yeni refresh token → `tokenTypes.refresh.storage` key'ine yazılır (rotating ise)
   - Timer yeniden kurulur
5. **Refresh Başarısız**: Token'lar temizlenir, logout durumuna geçilir

### 3. Token Expiry

Token expire olduğunda:

1. **Expiry Kontrolü**: Her API çağrısı öncesi access token expiry kontrol edilir
2. **Expired Token**: Access token expire olmuşsa:
   - Refresh token varsa → refresh denenir
   - Refresh yoksa veya başarısızsa → token temizlenir
   - `token.expired` event'i emit edilir
3. **Infinite Token**: `expiry: "infinite"` olan token'lar expire olmaz

### 4. Token Logout

Logout provider kökünde tanımlandığı için provider'ın tüm token'larını temizler:

1. **Manual Logout**: `logout(providerKey)` çağrıldığında
   - `logout.endpoint` varsa backend'e çağrı yapılır
   - Access ve refresh token'lar DataManager'dan silinir
   - `token.loggedOut` event'i emit edilir

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
  { "provider": "morph-idm-2fa", "token": "access" },
  { "provider": "morph-idm-1fa", "token": "access" },
  { "provider": "morph-idm-device", "token": "access" }
]
```

**Mantık:**
1. Array sırasına göre token kontrol edilir
2. İlk mevcut ve geçerli (expire olmamış) access token kullanılır
3. Hiçbiri yoksa son provider'ın grant flow'u başlatılır

**Örnek Senaryo:**

| Durum | morph-idm-2fa | morph-idm-1fa | morph-idm-device | Seçilen Token |
|-------|---------------|---------------|------------------|---------------|
| Senaryo 1 | ✅ Geçerli | ✅ Geçerli | ✅ Geçerli | **morph-idm-2fa** (ilk sırada) |
| Senaryo 2 | ❌ Yok | ✅ Geçerli | ✅ Geçerli | **morph-idm-1fa** (ikinci sırada) |
| Senaryo 3 | ❌ Expired | ❌ Yok | ✅ Geçerli | **morph-idm-device** (üçüncü sırada) |
| Senaryo 4 | ❌ Yok | ❌ Yok | ❌ Yok | **morph-idm-device** grant flow başlatılır |

### Token Selection API

```typescript
// Belirli bir requiredToken için token seç
const token = await authorizationManager.selectToken([
  { provider: "morph-idm-2fa", token: "access" },
  { provider: "morph-idm-1fa", token: "access" }
]);

// Token yoksa veya expired ise null döner
// Token yoksa ve grantFlow varsa otomatik grant başlatılır
```

## 💾 Token Storage Management

Token'lar DataManager'a config'deki `storage` tanımına göre saklanır. Her token kendi storage bilgisini taşır.

### Storage Key Format

```
auth.token.{provider}.{tokenType}
```

### Token Context Mapping

| Provider | Token | Context | Key | Açıklama |
|----------|-------|---------|-----|----------|
| morph-idm-device | access | `device` | `auth.token.morph-idm-device.access` | Bootstrap, şifresiz |
| morph-idm-1fa | access | `user` | `auth.token.morph-idm-1fa.access` | Uzun ömürlü, şifreli persist |
| morph-idm-2fa | access | `secureMemory` | `auth.token.morph-idm-2fa.access` | Kısa ömürlü, volatile |
| morph-idm-2fa | refresh | `user` | `auth.token.morph-idm-2fa.refresh` | Uzun ömürlü, şifreli persist |
| edevlet | access | `secureMemory` | `auth.token.edevlet.access` | Kısa ömürlü, volatile |
| edevlet | refresh | `user` | `auth.token.edevlet.refresh` | Şifreli persist |

## 🔗 Integration with Other Managers

### WorkflowManager Integration

Provider'ın `grantFlow`'u ile token almak için:

```typescript
// Grant flow başlat
const workflowInstance = await workflowManager.startWorkflow({
  domain: provider.grantFlow.domain,
  workflow: provider.grantFlow.workflow,
  requiredToken: provider.grantFlow.requiredToken
});

// Workflow tamamlandığında token response'dan alınır
// Access token → tokenTypes.access.storage'a kaydedilir
// Refresh token → tokenTypes.refresh.storage'a kaydedilir (varsa)
```

### DataManager Integration

Token'ları config'deki storage bilgisine göre saklamak ve okumak için:

```typescript
// Access token kaydet (config'den context ve key alınır)
const accessStorage = provider.tokenTypes.access.storage;
dataManager.setData(accessStorage.context, accessStorage.key, accessToken);

// Refresh token kaydet (varsa)
const refreshStorage = provider.tokenTypes.refresh?.storage;
if (refreshStorage) {
  dataManager.setData(refreshStorage.context, refreshStorage.key, refreshToken);
}

// Access token oku
const token = dataManager.getData(accessStorage.context, accessStorage.key);
```

### ApiClient Integration

API çağrıları için token injection:

```typescript
// Request interceptor'da token seç ve header'a ekle
const token = await authorizationManager.selectToken(requiredToken);
if (token) {
  request.headers['Authorization'] = `Bearer ${token.accessToken}`;
}
```

## ⚡ Event System

AuthorizationManager aşağıdaki event'leri emit eder:

| Event | Payload | Açıklama |
|-------|---------|----------|
| `token.granted` | `{ provider }` | Provider'ın token'ları başarıyla alındığında |
| `token.grantFailed` | `{ provider, error }` | Token alma başarısız olduğunda |
| `token.refreshed` | `{ provider }` | Token refresh başarılı olduğunda |
| `token.refreshFailed` | `{ provider, error }` | Token refresh başarısız olduğunda |
| `token.expired` | `{ provider }` | Access token expire olduğunda |
| `token.loggedOut` | `{ provider }` | Provider logout yapıldığında |
| `token.autoLogout` | `{ provider, reason }` | Auto-logout tetiklendiğinde (`"background"` veya `"inactivity"`) |

**Event Subscription:**

```typescript
authorizationManager.on('token.granted', (payload) => {
  console.log('Token granted:', payload.provider);
});

const unsubscribe = authorizationManager.on('token.expired', handler);
unsubscribe();
```

## 🔄 Auto-Refresh Mechanism

Refresh token tanımlıysa access token expire olmadan önce otomatik refresh:

1. **Timer Setup**: Access token alındığında, `tokenTypes.refresh.beforeExpiry` süresine göre timer kurulur
2. **Refresh Time**: `accessToken.expiresAt - refresh.beforeExpiry` zamanında refresh başlatılır
3. **Refresh Endpoint**: `tokenTypes.refresh.endpoint` çağrılır, refresh token gönderilir
4. **Refresh Success**: Yeni access + refresh token kaydedilir, timer yeniden kurulur
5. **Refresh Failure**: Token'lar temizlenir, `token.refreshFailed` event'i emit edilir

**Örnek:**
- Access token expiry: `12:00:00`
- `beforeExpiry`: `1m`
- Refresh zamanı: `11:59:00`

## 🚪 Auto-Logout Mechanism

### Background Auto-Logout

1. App background'a geçtiğinde `logout.autoLogoutAtBackground` timer'ı başlatılır
2. App foreground'a dönünce timer iptal edilir
3. Süre dolunca logout yapılır, `token.autoLogout` event'i emit edilir

### Inactivity Auto-Logout

1. Kullanıcı etkileşimleri (touch, click, scroll, keyboard) track edilir
2. Her etkileşimde timer reset edilir
3. `logout.autoLogoutAtInactivity` süresi dolunca logout yapılır

## 📝 Configuration Example

Tam bir auth provider configuration örneği (environment config'den):

```json
{
  "authProviders": [
    {
      "key": "morph-idm-device",
      "type": "oauth2",
      "grantFlow": {
        "runtime": "v2",
        "domain": "morph-idm",
        "workflow": "device-login",
        "requiredToken": []
      },
      "tokenTypes": {
        "access": {
          "expiry": "infinite",
          "storage": {
            "context": "device",
            "key": "auth.token.morph-idm-device.access"
          }
        }
      }
    },
    {
      "key": "morph-idm-1fa",
      "type": "oauth2",
      "logout": {
        "endpoint": "/auth/logout/1fa"
      },
      "tokenTypes": {
        "access": {
          "expiry": "90d",
          "storage": {
            "context": "user",
            "key": "auth.token.morph-idm-1fa.access"
          }
        }
      }
    },
    {
      "key": "morph-idm-2fa",
      "type": "oauth2",
      "grantFlow": {
        "runtime": "v2",
        "domain": "morph-idm",
        "workflow": "mobile-login",
        "requiredToken": [
          { "provider": "morph-idm-1fa", "token": "access" },
          { "provider": "morph-idm-device", "token": "access" }
        ]
      },
      "logout": {
        "endpoint": "/auth/logout",
        "autoLogoutAtBackground": "5m",
        "autoLogoutAtInactivity": "15m"
      },
      "tokenTypes": {
        "access": {
          "expiry": "5m",
          "storage": {
            "context": "secureMemory",
            "key": "auth.token.morph-idm-2fa.access"
          }
        },
        "refresh": {
          "expiry": "30d",
          "endpoint": "/auth/token/refresh",
          "strategy": "rotating",
          "beforeExpiry": "1m",
          "storage": {
            "context": "user",
            "key": "auth.token.morph-idm-2fa.refresh"
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
      "tokenExchange": {
        "endpoint": "/auth/exchange/edevlet"
      },
      "logout": {
        "endpoint": "/auth/logout/edevlet"
      },
      "tokenTypes": {
        "access": {
          "expiry": "1h",
          "storage": {
            "context": "secureMemory",
            "key": "auth.token.edevlet.access"
          }
        },
        "refresh": {
          "expiry": "7d",
          "endpoint": "/auth/token/refresh",
          "strategy": "rotating",
          "beforeExpiry": "5m",
          "storage": {
            "context": "user",
            "key": "auth.token.edevlet.refresh"
          }
        }
      }
    }
  ]
}
```

## 🔐 Security Considerations

1. **Token Storage**: Token'lar config'deki storage tanımına göre saklanır (secureMemory volatile, user şifreli persist)
2. **Token Expiry**: Expired token'lar otomatik temizlenir
3. **Auto-Logout**: Background/inactivity timeout'lar provider kökünde tanımlanır, tüm token'ları temizler
4. **Refresh Strategy**: Rotating strategy ile her refresh'te eski token'lar invalid olur
5. **Grant Flow Security**: Grant flow'lar WorkflowManager ile güvenli şekilde yönetilir

## 🎯 Usage Examples

### Initialize AuthorizationManager

```typescript
// Environment config'den authProviders alınır
const environmentConfig = await fetchEnvironmentConfig();
const authProviders = environmentConfig.stages[0].authProviders;

// AuthorizationManager initialize edilir
const authorizationManager = new AuthorizationManager({
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
  { provider: "morph-idm-2fa", token: "access" },
  { provider: "morph-idm-1fa", token: "access" }
];

const token = await authorizationManager.selectToken(requiredToken);
if (token) {
  const response = await apiClient.get('/api/data', {
    headers: {
      'Authorization': `Bearer ${token.accessToken}`
    }
  });
}
```

### Manual Token Grant

```typescript
// Belirli bir provider'ın token'ını al
const token = await authorizationManager.grantToken('morph-idm-2fa');
```

### Manual Logout

```typescript
// Belirli bir provider'ı logout yap (tüm token'ları temizler)
await authorizationManager.logout('morph-idm-2fa');
```

### Listen to Events

```typescript
authorizationManager.on('token.granted', (payload) => {
  console.log('Token granted:', payload.provider);
});

authorizationManager.on('token.expired', (payload) => {
  console.log('Token expired:', payload.provider);
  // Kullanıcıyı login sayfasına yönlendir
});

authorizationManager.on('token.autoLogout', (payload) => {
  console.log('Auto logout:', payload.provider, payload.reason);
});
```
