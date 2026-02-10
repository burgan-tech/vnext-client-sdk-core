# Authorization Manager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar adapter katmanında gerçekleştirilir.

AuthorizationManager, environment'ten gelen authentication configuration'ı parse eden, token lifecycle'ını yöneten ve token seçim mantığını uygulayan core SDK sınıfıdır. DataManager ve Router gibi **non-visual** bir component'tir.

## 🎯 Temel Amaç

Environment configuration'dan gelen `authProviders` yapılandırmasını parse edip, token'ların yaşam döngüsünü (grant, refresh, expiry, logout) yönetmek ve API çağrıları için doğru token'ı seçmektir.

**Lifecycle Entegrasyonu:**
- AuthorizationManager, environment config alındıktan sonra initialize edilir (lifecycle.md - step 200: Environment.Config.Loaded)
- Config'den `authProviders` array'i parse edilir ve her provider için token type'ları yönetilir
- Device token grant flow'u otomatik başlatılır (step 300: AuthorizationManager.Init)
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
* **Active Identity Resolution**: Aktif 2FA token'dan `activeUser` / `activeScope`, tüm geçerli 1FA token'lardan `active1FASessions` bilgilerini çıkarır ve expose eder

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
| `identityClaims` | Provider kökü | *(Opsiyonel)* JWT claim → identity mapping. Tanımlıysa bu provider identity kaynağıdır |
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

## 👤 Active Identity Resolution

AuthorizationManager, JWT token claim'lerinden kimlik bilgilerini çıkarır ve uygulama genelinde expose eder. Identity resolution **yalnızca** `identityClaims` tanımlı provider'larda çalışır (örn: `morph-idm-*`). `edevlet`, `burgan-yatirim` gibi harici provider'lar identity'ye katkı yapmaz.

### Identity Claims Configuration

Provider config'de opsiyonel `identityClaims` alanı, JWT claim adlarını identity property'lerine map eder:

```json
{
  "key": "morph-idm-2fa",
  "type": "oauth2",
  "identityClaims": {
    "user": "act",
    "scope": "sub"
  },
  "tokenTypes": { ... }
}
```

| Config Key | JWT Claim | Anlamı | Örnek Değer |
|------------|-----------|--------|-------------|
| `user` | `act` | Kullanıcı (operatör, yetkili) | `"user-123"` |
| `scope` | `sub` | Müşteri (hesap, kapsam) | `"customer-456"` |

> **Kural:** `identityClaims` tanımlı olmayan provider'lar (device, edevlet vb.) identity'ye katkı yapmaz. Token'ları grant edilse bile `activeUser` / `activeScope` etkilenmez.

### Exposed Identity Properties

AuthorizationManager şu read-only property'leri expose eder:

```typescript
interface IAuthorizationManager {
  // ... token methods ...

  /** Aktif 2FA token'dan çıkarılan kullanıcı. 2FA yoksa null. */
  readonly activeUser: string | null;

  /** Aktif 2FA token'dan çıkarılan müşteri/kapsam. 2FA yoksa null. */
  readonly activeScope: string | null;

  /** Tüm geçerli 1FA oturumları. Bir kullanıcı birden fazla müşteri için login olabilir. */
  readonly active1FASessions: ReadonlyArray<IdentitySession>;
}

interface IdentitySession {
  user: string;     // JWT 'act' claim
  scope: string;    // JWT 'sub' claim
  token: string;    // Token değeri (API çağrılarında kullanılır)
  expiresAt: Date;  // Token expiry
}
```

### Identity Çözümleme Mantığı

#### `activeUser` ve `activeScope` (2FA'dan)

- **Kaynak:** Sadece `identityClaims` tanımlı ve **2FA seviyesindeki** provider'ın aktif access token'ı
- **Aynı anda tek 2FA:** 2FA token `secureMemory`'de tutulur, volatile — aynı anda yalnızca bir 2FA oturumu olabilir
- **Çözümleme:** Token grant edildiğinde JWT decode edilir → `act` → `activeUser`, `sub` → `activeScope`
- **Temizlenme:** 2FA logout veya token expire olduğunda `activeUser` ve `activeScope` null olur

| Durum | activeUser | activeScope |
|-------|------------|-------------|
| 2FA token aktif | `"act"` claim değeri | `"sub"` claim değeri |
| 2FA yok, sadece 1FA | `null` | `null` |
| Sadece device token | `null` | `null` |

#### `active1FASessions` (1FA'lardan)

- **Kaynak:** `identityClaims` tanımlı ve **1FA seviyesindeki** provider'ın tüm geçerli access token'ları
- **Çoklu oturum:** 1FA uzun ömürlü (`90d`) olduğundan, bir kullanıcı birden fazla müşteri (scope) için login olabilir
- **Array olarak saklanır:** 1FA token'ları DataManager'da array olarak tutulur
- **Expire kontrolü:** Expire olmuş oturumlar listeden otomatik temizlenir

**Örnek Senaryo:**

```
Kullanıcı "userX" üç müşteri için 1FA login yapmış:

active1FASessions = [
  { user: "userX", scope: "customer-A", token: "eyJ...", expiresAt: "2026-05-01" },
  { user: "userX", scope: "customer-B", token: "eyJ...", expiresAt: "2026-04-15" },
  { user: "userX", scope: "customer-C", token: "eyJ...", expiresAt: "2026-05-10" }
]

Kullanıcı "customer-B" için 2FA yaparsa:
  activeUser  = "userX"
  activeScope = "customer-B"
```

### 1FA Multi-Session Storage

1FA token'ları tek bir key altında array olarak saklanır:

```json
{
  "storage": {
    "context": "user",
    "key": "auth.token.morph-idm-1fa.access"
  }
}
```

DataManager'daki değer:

```json
[
  {
    "token": "eyJhbGciOi...",
    "user": "userX",
    "scope": "customer-A",
    "expiresAt": "2026-05-01T00:00:00Z"
  },
  {
    "token": "eyJhbGciOi...",
    "user": "userX",
    "scope": "customer-B",
    "expiresAt": "2026-04-15T00:00:00Z"
  }
]
```

**Yeni 1FA token geldiğinde:**
1. JWT decode edilir → `act` (user) ve `sub` (scope) çıkarılır
2. Aynı `scope` için mevcut token varsa → güncellenir (replace)
3. Yeni `scope` ise → array'e eklenir
4. Expire olmuş token'lar temizlenir

### Identity Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Device Token Grant (identityClaims yok)                  │
│    → activeUser: null, activeScope: null                    │
│    → active1FASessions: []                                  │
├─────────────────────────────────────────────────────────────┤
│ 2. 1FA Token Grant (müşteri A için)                         │
│    → JWT decode → { act: "userX", sub: "customer-A" }       │
│    → active1FASessions: [{ user, scope, token, expiresAt }] │
│    → activeUser: null, activeScope: null (2FA yok henüz)    │
├─────────────────────────────────────────────────────────────┤
│ 3. 1FA Token Grant (müşteri B için)                         │
│    → active1FASessions: [customerA, customerB]              │
│    → activeUser: null, activeScope: null (2FA yok henüz)    │
├─────────────────────────────────────────────────────────────┤
│ 4. 2FA Token Grant (müşteri B seçilmiş)                     │
│    → JWT decode → { act: "userX", sub: "customer-B" }       │
│    → activeUser: "userX"                                    │
│    → activeScope: "customer-B"                              │
├─────────────────────────────────────────────────────────────┤
│ 5. 2FA Logout                                               │
│    → activeUser: null, activeScope: null                    │
│    → active1FASessions: [customerA, customerB] (korunur)    │
├─────────────────────────────────────────────────────────────┤
│ 6. 2FA Token Grant (müşteri A seçilmiş)                     │
│    → activeUser: "userX"                                    │
│    → activeScope: "customer-A"                              │
└─────────────────────────────────────────────────────────────┘
```

### Identity Event'leri

| Event | Payload | Açıklama |
|-------|---------|----------|
| `identity.changed` | `{ activeUser, activeScope }` | 2FA grant veya logout sonrası identity değiştiğinde |
| `identity.sessionAdded` | `{ session: IdentitySession }` | Yeni 1FA oturumu eklendiğinde |
| `identity.sessionRemoved` | `{ session: IdentitySession }` | 1FA oturumu expire veya logout olduğunda |

### DI ile Identity Kullanımı

Diğer modüller AuthorizationManager'ı inject ederek identity bilgisine erişir:

```typescript
class CustomerDashboard {
  constructor(
    private readonly authorizationManager: IAuthorizationManager,
    private readonly apiClient: IApiClient
  ) {}

  get currentUser(): string | null {
    return this.authorizationManager.activeUser;
  }

  get currentScope(): string | null {
    return this.authorizationManager.activeScope;
  }

  get availableCustomers(): ReadonlyArray<IdentitySession> {
    return this.authorizationManager.active1FASessions;
  }

  async switchCustomer(scope: string): Promise<void> {
    // Seçilen müşteri için 2FA grant flow başlat
    // (1FA oturumu zaten mevcut, 2FA workflow bu scope ile çalışır)
    await this.authorizationManager.grantToken('morph-idm-2fa');
  }
}
```

```typescript
class DataResolver {
  constructor(
    private readonly authorizationManager: IAuthorizationManager,
    private readonly dataManager: IDataManager
  ) {}

  /**
   * x-autoBind içindeki $ActiveUser ve $ActiveScope değişkenlerini
   * AuthorizationManager'dan resolve eder.
   */
  resolveVariable(variable: string): string | null {
    switch (variable) {
      case '$ActiveUser':
        return this.authorizationManager.activeUser;
      case '$ActiveScope':
        return this.authorizationManager.activeScope;
      default:
        return null;
    }
  }
}
```

## 🔗 Integration with Other Managers

> **DI Yaklaşımı:** Tüm manager'lar bir DI container üzerinden register edilir ve ihtiyaç duyan sınıflar constructor injection ile bağımlılıklarını alır. Hiçbir sınıf doğrudan `new` ile başka bir manager oluşturmaz.

### WorkflowManager Integration

AuthorizationManager, grant flow'ları çalıştırmak için WorkflowManager'ı inject alır:

```typescript
class AuthorizationManager {
  constructor(
    private readonly workflowManager: IWorkflowManager,
    private readonly dataManager: IDataManager
  ) {}

  async grantToken(providerKey: string): Promise<TokenResult> {
    const provider = this.getProvider(providerKey);

    // Grant flow varsa WorkflowManager üzerinden workflow çalıştırılır
    const workflowInstance = await this.workflowManager.startWorkflow({
      domain: provider.grantFlow.domain,
      workflow: provider.grantFlow.workflow,
      requiredToken: provider.grantFlow.requiredToken
    });

    // Workflow tamamlandığında token response'dan alınır
    // Access token → tokenTypes.access.storage'a kaydedilir
    // Refresh token → tokenTypes.refresh.storage'a kaydedilir (varsa)
  }
}
```

### DataManager Integration

Token storage işlemleri için DataManager inject edilir:

```typescript
class AuthorizationManager {
  constructor(
    private readonly dataManager: IDataManager,
    // ...diğer bağımlılıklar
  ) {}

  private saveTokens(provider: AuthProvider, accessToken: string, refreshToken?: string): void {
    // Access token kaydet (config'den context ve key alınır)
    const accessStorage = provider.tokenTypes.access.storage;
    this.dataManager.setData(accessStorage.context, accessStorage.key, accessToken);

    // Refresh token kaydet (varsa)
    const refreshStorage = provider.tokenTypes.refresh?.storage;
    if (refreshStorage && refreshToken) {
      this.dataManager.setData(refreshStorage.context, refreshStorage.key, refreshToken);
    }
  }

  private readAccessToken(provider: AuthProvider): string | null {
    const { context, key } = provider.tokenTypes.access.storage;
    return this.dataManager.getData(context, key);
  }
}
```

### ApiClient Integration

ApiClient, token injection için AuthorizationManager'ı inject alır:

```typescript
class ApiClient {
  constructor(
    private readonly authorizationManager: IAuthorizationManager
  ) {}

  async request(url: string, options: RequestOptions): Promise<Response> {
    // Request interceptor'da token seç ve header'a ekle
    const token = await this.authorizationManager.selectToken(options.requiredToken);
    if (token) {
      options.headers['Authorization'] = `Bearer ${token.accessToken}`;
    }
    return this.execute(url, options);
  }
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

**Event Subscription (DI ile inject edilmiş instance üzerinden):**

```typescript
class SessionGuard {
  constructor(
    private readonly authorizationManager: IAuthorizationManager,
    private readonly router: IRouter
  ) {
    // Subscribe at construction via injected instance
    this.authorizationManager.on('token.expired', this.onTokenExpired.bind(this));
    this.authorizationManager.on('token.autoLogout', this.onAutoLogout.bind(this));
  }

  private onTokenExpired(payload: { provider: string }): void {
    // Kullanıcıyı login sayfasına yönlendir
    this.router.navigate('/login');
  }

  private onAutoLogout(payload: { provider: string; reason: string }): void {
    console.log('Auto logout:', payload.provider, payload.reason);
    this.router.navigate('/login');
  }
}
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
      "identityClaims": {
        "user": "act",
        "scope": "sub"
      },
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
      "identityClaims": {
        "user": "act",
        "scope": "sub"
      },
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

### DI Container Registration

Tüm manager'lar DI container'a register edilir. Hiçbir sınıf doğrudan `new` ile başka bir manager oluşturmaz.

```typescript
// DI Container setup — bootstrap sırasında bir kez çalışır
container.registerSingleton<IDataManager>(DataManager);
container.registerSingleton<IWorkflowManager>(WorkflowManager);
container.registerSingleton<IApiClient>(ApiClient);
container.registerSingleton<IAuthorizationManager>(AuthorizationManager);
container.registerSingleton<IRouter>(Router);

// AuthorizationManager'ın bağımlılıkları otomatik resolve edilir:
//   IDataManager, IWorkflowManager, IApiClient
```

### AuthorizationManager Initialize

```typescript
class AuthorizationManager {
  constructor(
    private readonly dataManager: IDataManager,
    private readonly workflowManager: IWorkflowManager,
    private readonly apiClient: IApiClient
  ) {}

  async initialize(authProviders: AuthProvider[]): Promise<void> {
    // Environment config'den gelen authProviders parse edilir
    this.parseProviders(authProviders);

    // Device token grant flow otomatik başlatılır
    await this.grantToken('morph-idm-device');

    // Mevcut token'lar için refresh timer'ları kurulur
    this.setupRefreshTimers();
  }
}
```

### Bir Modülde AuthorizationManager Kullanımı

Herhangi bir modül/sınıf, constructor üzerinden inject ederek kullanır:

```typescript
class TransferWorkflow {
  constructor(
    private readonly authorizationManager: IAuthorizationManager,
    private readonly apiClient: IApiClient
  ) {}

  async executeTransfer(payload: TransferPayload): Promise<TransferResult> {
    // Token seçimi inject edilen instance üzerinden yapılır
    const token = await this.authorizationManager.selectToken([
      { provider: "morph-idm-2fa", token: "access" },
      { provider: "morph-idm-1fa", token: "access" }
    ]);

    if (!token) {
      throw new AuthenticationRequiredError();
    }

    return this.apiClient.post('/api/transfer', payload, {
      headers: { 'Authorization': `Bearer ${token.accessToken}` }
    });
  }
}
```

### Manual Token Grant (inject edilmiş instance ile)

```typescript
class LoginViewController {
  constructor(
    private readonly authorizationManager: IAuthorizationManager,
    private readonly router: IRouter
  ) {}

  async onLoginButtonTapped(): Promise<void> {
    // Belirli bir provider'ın token'ını al
    const result = await this.authorizationManager.grantToken('morph-idm-2fa');

    if (result.success) {
      this.router.navigate('/dashboard');
    }
  }

  async onLogoutButtonTapped(): Promise<void> {
    // Belirli bir provider'ı logout yap (tüm token'ları temizler)
    await this.authorizationManager.logout('morph-idm-2fa');
    this.router.navigate('/login');
  }
}
```

### Event Listening (inject edilmiş instance ile)

```typescript
class NotificationService {
  constructor(
    private readonly authorizationManager: IAuthorizationManager
  ) {
    this.authorizationManager.on('token.granted', this.onTokenGranted.bind(this));
    this.authorizationManager.on('token.expired', this.onTokenExpired.bind(this));
    this.authorizationManager.on('token.autoLogout', this.onAutoLogout.bind(this));
  }

  private onTokenGranted(payload: { provider: string }): void {
    console.log('Token granted:', payload.provider);
  }

  private onTokenExpired(payload: { provider: string }): void {
    console.log('Token expired:', payload.provider);
  }

  private onAutoLogout(payload: { provider: string; reason: string }): void {
    console.log('Auto logout:', payload.provider, payload.reason);
  }
}
```
