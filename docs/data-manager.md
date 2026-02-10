# Data Manager

Uygulamanın **merkezi state store**'unu sağlayan core SDK sınıfıdır. Hem TypeScript (web) hem de Flutter (mobil) platformlarında aynı interface ve davranışı sağlar.

> **DI Yaklaşımı:** DataManager, DI container üzerinden singleton olarak register edilir. İhtiyaç duyan tüm sınıflar (manager, service, component) constructor injection ile `IDataManager`'ı alır. `$ActiveUser` ve `$ActiveScope` dinamik değişkenleri, inject edilen `IAuthorizationManager`'dan otomatik resolve edilir.

## 🏪 State Store Rolü

DataManager, uygulamanın **tüm verilerinin merkezi deposudur**. Geleneksel state management çözümlerinden farklı olarak:

* **Unified Storage**: Tüm veri türlerini (device, user, scope, workflow, artifact) tek bir interface altında yönetir
* **Context-Aware**: Device, User, Scope ve Workflow seviyelerinde veri ayrımı yapar
* **Automatic Storage**: Context'e göre storage türünü otomatik belirler (in-memory, local persistent, secure persistent)
* **Observable**: Tüm veri değişiklikleri reactive olarak broadcast edilir
* **Cross-Component**: Farklı UI component'ları (Vue/React component'ları veya Flutter widget'ları), manager'lar ve service'ler arasında veri paylaşımı sağlar
* **Lifecycle Management**: TTL, caching, persistence otomatik yönetilir

> **💡 Önemli Not**: DataManager, Redux/MobX/Provider gibi state management kütüphanelerinin yerini alır. Uygulamanın tek veri kaynağıdır (Single Source of Truth).

## 🎯 Temel Amaç

Uygulamanın tüm state'ini observable bir şekilde yönetmek, veri değişikliklerini UI component'lara, manager'lara ve service'lere otomatik olarak broadcast etmektir.

## 🚀 Temel Sunduğu Hizmetler

* **State Storage**: Uygulamanın tüm state'ini merkezi olarak depolar (UI state, business data, cache, user preferences)
* **Reactive State Management**: State değişikliklerini otomatik olarak tüm subscriber'lara broadcast eder
* **Context-Based Storage**: DataContext'e göre otomatik storage kararı (in-memory, local, secure)
* **Multi-Context Isolation**: Device, User, Scope ve Workflow verilerini güvenli şekilde ayırır
* **Dynamic Data Structure**: JSON benzeri hiyerarşik veri yapılarını destekler (Map, List, primitives)
* **Data Binding**: UI component'larını (Vue/React component'ları veya Flutter widget'ları) state'e one-way/two-way binding ile bağlar
* **Cross-Component Communication**: Manager'lar, Service'ler ve Widget'lar arası state paylaşımı
* **TTL & Persistence**: State lifecycle'ını otomatik yönetir (cache, expire, persist)
* **Dynamic Variables**: Key'lerde `$ActiveUser` ve `$ActiveScope` dinamik değişken desteği

## 📍 State Access Patterns

DataManager'daki state'lere erişim tek boyutlu bir **DataContext** sistemi kullanır:

### DataContext Enum

| Context | Storage Altyapısı | Encryption | Açıklama |
|---------|-------------------|------------|----------|
| `device` | **Secure Storage** | ❌ | Cihaz bilgileri (deviceId, installationId). Bootstrap için şifresiz! |
| `user` | **Secure Storage** | ✅ Şifreli | Kullanıcı verileri (profile, tokens, preferences) |
| `scope` | **Secure Storage** | ✅ Şifreli | İşlem yapılan müşteri/kapsam verileri |
| `workflowInstance` | In-Memory | ❌ | İş akışı instance verisi (geçici) |
| `workflowTransition` | In-Memory | ❌ | Form/transition verisi (geçici) |
| `artifact` | **Local Storage** | ❌ | Render içerikleri, JSON dosyaları (TTL ile, cache) |
| `secureMemory` | In-Memory | ❌ | Hassas runtime verileri (encryption key). ASLA persist edilmez! |

### Storage Altyapıları

| Altyapı | Açıklama | Platform Örnekleri |
|---------|----------|-------------------|
| **Secure Storage** | Platform-native güvenli storage. App sandbox içinde, diğer app'ler erişemez. | iOS Keychain, Android EncryptedSharedPreferences |
| **Local Storage** | Normal persistent storage. Cache için uygun, hassas veri için değil. | Web localStorage, Android SharedPreferences, iOS UserDefaults |
| **In-Memory** | RAM'de tutulur, persist edilmez. App kapanınca silinir. | JavaScript Map/Object, Dart Map |

> **⚠️ Storage Otomatik Belirlenir**: DataManager, context'e göre hangi storage altyapısını kullanacağını otomatik belirler. Geliştiricinin belirtmesine gerek yoktur.

> **🐔🥚 Bootstrap Problemi**: `device` context şifrelenmez çünkü Device Register için `deviceId` ve `installationId` gerekli. Bu bilgiler olmadan encryption key alınamaz. Hassas veriler `user` ve `scope` context'lerinde şifreli tutulur.

> **🔐 secureMemory**: Encryption key gibi hassas veriler için özel context. Sadece runtime'da var, app kapanınca kaybolur. `x-autoStore` ile uyumlu - Device Register response'u otomatik yazılabilir.

### Token Storage Stratejisi

Token'ların hangi context'te tutulacağı **backend config'den** belirlenir. Genel strateji:

| Token | Ömür | Context | Açıklama |
|-------|------|---------|----------|
| Device Token | Uzun | `device` | Bootstrap için, şifresiz ama sadece device tanımlama |
| 1FA Token | 90 gün | `user` | Uzun ömürlü, şifreli persist gerekli |
| 2FA Token | 5 dk | `secureMemory` | Kısa ömürlü, volatile yeterli |
| Access Token | Kısa | `secureMemory` | Kısa ömürlü, volatile |
| Refresh Token | Orta | `user` | Şifreli persist gerekli |

> **📝 TODO:** Token context mapping'i `client-function-config.json`'da `tokenStorage` objesi ile tanımlanacak. Her token tipi için `context` ve `key` belirlenecek.

## 🔐 Güvenlik: Secure Storage Encryption

Secure Persistent storage'daki veriler (`user` ve `scope` context'leri) şifrelenir. Şifreleme anahtarı **backend tarafından sağlanır** ve **asla persist edilmez** (`secureMemory`'de tutulur).

> **📝 Not:** `device` context şifrelenmez - bootstrap için gerekli (`deviceId`, `installationId` okumak için key lazım olurdu → döngü).

### Encryption Key Yönetimi

**Temel Prensipler:**
- ❌ Key uygulamada hardcoded değil (hijack koruması)
- ❌ Key persist edilmez (sadece memory'de)
- ✅ Key, Device Register API'den alınır
- ✅ Backend, deviceId + installationId kombinasyonuna göre key üretir/döner

**Primary Key = deviceId + installationId**

| Senaryo | deviceId | installationId | encryptionKey | Sonuç |
|---------|----------|----------------|---------------|-------|
| İlk kurulum | D123 | I-001 | KEY-A | Yeni key üretilir |
| Normal kullanım | D123 | I-001 | KEY-A | Mevcut key döner |
| **Yeniden kurulum** | D123 | **I-002** | **KEY-B** | Yeni key! Eski veriler erişilemez |
| Farklı cihaz | D456 | I-003 | KEY-C | Yeni key |

> **🛡️ Güvenlik:** Uygulama silinip yeniden kurulduğunda `installationId` değişir, yeni encryption key üretilir. Eski encrypted veriler artık decrypt edilemez - temiz başlangıç garantisi.

### Backend Key Derivation (Disaster Recovery)

Backend, encryption key'leri **DB'de saklamaz**. Bunun yerine **Key Derivation Function (KDF)** kullanarak her seferinde hesaplar:

```
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND - Key Derivation                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   HKDF(masterSecret, deviceId + installationId)                 │
│                        ↓                                        │
│                  encryptionKey                                  │
│                                                                 │
│   • Master Secret → HSM'de güvende (asla değişmez)              │
│   • DB'de key saklanmaz (her seferinde hesaplanır)              │
│   • Deterministic: Aynı input = Aynı output                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Avantajları:**

| Özellik | Açıklama |
|---------|----------|
| ✅ DB'de key yok | Key saklanmaz, hesaplanır - DB breach'de key çalınamaz |
| ✅ Disaster Recovery | Master Secret korunduğu sürece tüm key'ler recover edilebilir |
| ✅ Deterministic | Aynı deviceId + installationId = Her zaman aynı key |
| ✅ Basit | Version yönetimi, legacy key yok - tek formül |

**Disaster Recovery Senaryosu:**

```
┌─────────────────────────────────────────────────────────────────┐
│ SENARYO: Backend DB tamamen silindi/crash                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. Master Secret HSM'de güvende ✅                              │
│                                                                 │
│ 2. Client device register geldi:                                │
│    { deviceId: "D123", installationId: "I-001" }                │
│                                                                 │
│ 3. Backend key derive etti:                                     │
│    HKDF(masterSecret, "D123" + "I-001") → KEY-A                 │
│                                                                 │
│ 4. Aynı key! Client encrypted verilerini decrypt edebilir ✅    │
│                                                                 │
│ ⚡ DB'de hiçbir şey saklanmamıştı, ama key aynı!                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Özet:**
- `deviceId + installationId` değişmedi → Aynı key → Veriler erişilebilir
- `installationId` değişti (yeniden kurulum) → Farklı key → Temiz başlangıç
- Master Secret korunduğu sürece → Her şey recover edilebilir

### Encryption Lifecycle (secureMemory ile)

Encryption key artık **`secureMemory` context'ine** yazılır - özel unlock metodları yerine tutarlı `setData/getData` API kullanılır.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. APP START                                                    │
├─────────────────────────────────────────────────────────────────┤
│ DataManager başlar → secureMemory boş (key yok)                 │
│ Device/User/Scope context'lerine erişim BLOCKED                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. DEVICE REGISTER (x-autoStore ile otomatik)                   │
├─────────────────────────────────────────────────────────────────┤
│ POST /device-register { deviceId, installationId, ... }         │
│ Response: { deviceToken, encryptionKey }                        │
│                                                                 │
│ Backend Schema (x-autoStore):                                   │
│   "encryptionKey": {                                            │
│     "x-autoStore": {                                            │
│       "context": "secureMemory",                                │
│       "key": "encryption/key"                                   │
│     }                                                           │
│   }                                                             │
│                                                                 │
│ SDK otomatik olarak:                                            │
│   dataManager.setData(secureMemory, "encryption/key", key)      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. UNLOCKED STATE                                               │
├─────────────────────────────────────────────────────────────────┤
│ secureMemory'de key var → Tüm context'lere erişim OK            │
│ Key sadece memory'de (secureMemory asla persist edilmez)        │
│                                                                 │
│ DataManager encryption key'i buradan okur:                      │
│   dataManager.getData(secureMemory, "encryption/key")           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. APP CLOSE / LOGOUT                                           │
├─────────────────────────────────────────────────────────────────┤
│ Logout için:                                                    │
│   dataManager.deleteData(secureMemory, "encryption/key")        │
│                                                                 │
│ App kapanınca → secureMemory tamamen silinir (memory-only)      │
│ Tekrar açılınca → Device Register gerekli                       │
└─────────────────────────────────────────────────────────────────┘
```

### Secure Storage API

**TypeScript:**
```typescript
// Inject edilmiş dataManager üzerinden:

// Encryption key yazma (Device Register sonrası — genellikle x-autoStore ile otomatik)
this.dataManager.setData(DataContext.secureMemory, "encryption/key", encryptionKey);

// Secure storage durumu kontrolü
const isUnlocked = this.dataManager.getData(DataContext.secureMemory, "encryption/key") !== undefined;

// Logout - key'i sil (opsiyonel, app kapanınca zaten silinir)
this.dataManager.deleteData(DataContext.secureMemory, "encryption/key");
```

**Flutter (Dart):**
```dart
// Inject edilmiş _dataManager üzerinden:

// Encryption key yazma (Device Register sonrası — genellikle x-autoStore ile otomatik)
_dataManager.setData(DataContext.secureMemory, "encryption/key", encryptionKey);

// Secure storage durumu kontrolü
final isUnlocked = _dataManager.getData(DataContext.secureMemory, "encryption/key") != null;

// Logout - key'i sil (opsiyonel, app kapanınca zaten silinir)
_dataManager.deleteData(DataContext.secureMemory, "encryption/key");
```

### Kullanım Örneği

**TypeScript:**
```typescript
class AppBootstrapService {
  constructor(
    private readonly dataManager: IDataManager,
    private readonly authorizationManager: IAuthorizationManager
  ) {}

  async initialize(): Promise<void> {
    // 1. Device register - x-autoStore ile encryptionKey otomatik secureMemory'ye yazılır
    await this.authorizationManager.grantToken('morph-idm-device');

    // 2. Key otomatik olarak secureMemory'ye yazıldı (x-autoStore sayesinde)

    // 3. Artık tüm context'lere erişilebilir
    const userProfile = this.dataManager.getData(DataContext.user, "profile");
    const deviceSettings = this.dataManager.getData(DataContext.device, "settings");
  }

  logout(): void {
    // secureMemory'yi temizle (key silinir)
    this.dataManager.clearData(DataContext.secureMemory);

    // Kullanıcı verilerini temizle (opsiyonel)
    this.dataManager.clearData(DataContext.user);
    this.dataManager.clearData(DataContext.scope);
  }
}
```

**Flutter (Dart):**
```dart
class AppBootstrapService {
  final IDataManager _dataManager;
  final IAuthorizationManager _authorizationManager;

  AppBootstrapService(this._dataManager, this._authorizationManager);

  Future<void> initialize() async {
    // 1. Device register - x-autoStore ile encryptionKey otomatik secureMemory'ye yazılır
    await _authorizationManager.grantToken('morph-idm-device');

    // 2. Key otomatik olarak secureMemory'ye yazıldı (x-autoStore sayesinde)

    // 3. Artık tüm context'lere erişilebilir
    final userProfile = _dataManager.getData(DataContext.user, "profile");
    final deviceSettings = _dataManager.getData(DataContext.device, "settings");
  }

  void logout() {
    // secureMemory'yi temizle (key silinir)
    _dataManager.clearData(DataContext.secureMemory);

    // Kullanıcı verilerini temizle (opsiyonel)
    _dataManager.clearData(DataContext.user);
    _dataManager.clearData(DataContext.scope);
  }
}
```

### Güvenlik Avantajları

| Tehdit | Koruma |
|--------|--------|
| App hijack (kod inceleme) | ✅ Key hardcoded değil, bulunamaz |
| Cihaz çalınması | ✅ Key memory'de, app restart gerekli, device register ile yeni key |
| Yeniden kurulum | ✅ installationId değişir, yeni key, eski veriler erişilemez |
| Fraud (device klonlama) | ✅ installationId farklı olur |
| Memory dump | ⚠️ Uygulama açıkken teorik risk (native secure enclave ile azaltılabilir) |

### Dinamik Key Değişkenleri

Key'lerde iki dinamik değişken kullanılabilir. Bu değişkenler **AuthorizationManager**'dan otomatik resolve edilir:

| Değişken | Kaynak | Açıklama | Örnek Değer |
|----------|--------|----------|-------------|
| `$ActiveUser` | `authorizationManager.activeUser` | Aktif 2FA token'daki kullanıcı (JWT `act` claim) | `"employee123"` |
| `$ActiveScope` | `authorizationManager.activeScope` | Aktif 2FA token'daki müşteri/kapsam (JWT `sub` claim) | `"C987654321"` |

> **⚠️ Önemli:** `$ActiveUser` ve `$ActiveScope` yalnızca aktif 2FA oturumu varken değer döner. 2FA yoksa `null` olur ve bu değişkenleri içeren key'lere erişim hata verir.

**DataManager, bu değişkenleri inject ettiği `IAuthorizationManager` üzerinden çözer:**

```typescript
class DataManager {
  constructor(
    private readonly authorizationManager: IAuthorizationManager
  ) {
    // Identity değiştiğinde ilgili listener'ları tetikle
    this.authorizationManager.on('identity.changed', () => {
      this.reEvaluateDynamicBindings();
    });
  }

  private resolveKey(key: string): string {
    const user = this.authorizationManager.activeUser;
    const scope = this.authorizationManager.activeScope;
    return key
      .replace('$ActiveUser', user ?? '')
      .replace('$ActiveScope', scope ?? '');
  }
}
```

**Kullanım örneği (inject edilmiş DataManager üzerinden):**

```typescript
class CustomerService {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  getUserPreferences(): any {
    // Çalışanın kendi tercihleri — $ActiveUser runtime'da resolve edilir
    return this.dataManager.getData(DataContext.user, "preferences/$ActiveUser/theme");
    // → "preferences/employee123/theme"
  }

  getCustomerProfile(): any {
    // İşlem yapılan müşterinin bilgileri
    return this.dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile");
    // → "customer/C987654321/profile"
  }

  getCustomerNotes(): any {
    // Çalışanın, müşteri için açtığı notlar
    return this.dataManager.getData(DataContext.scope, "notes/$ActiveUser/$ActiveScope");
    // → "notes/employee123/C987654321"
  }
}
```

### State Adresleme

* **Context-based**: State ownership ve storage DataContext enum ile belirlenir
* **Key-based**: Her context içinde unique string key ile state adreslenebilir
* **Path-based**: Slash notation ile hiyerarşik state yapısı (örn: "loan-app/instance-id/transition-name")
* **DataPath-based**: Kompleks state object'lerin içindeki spesifik property'lere erişim (örn: "applicant.firstName")

**State Adresleme Örneği (inject edilmiş instance üzerinden):**

**TypeScript:**
```typescript
// Context: user, Key: preferences, DataPath: theme
this.dataManager.getData(DataContext.user, "preferences", { dataPath: "theme" });

// Dinamik değişken ile — $ActiveScope AuthorizationManager'dan resolve edilir
this.dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile", { dataPath: "firstName" });
```

**Flutter (Dart):**
```dart
// Context: user, Key: preferences, DataPath: theme
_dataManager.getData(DataContext.user, "preferences", dataPath: "theme");

// Dinamik değişken ile — $ActiveScope AuthorizationManager'dan resolve edilir
_dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile", dataPath: "firstName");
```




## 💡 Kullanım Senaryoları

> **DI Pattern:** Tüm örneklerde DataManager, constructor injection ile inject edilmiş olarak kullanılır. Hiçbir sınıf DataManager'ı doğrudan oluşturmaz.

### **Workflow Veri Yönetimi Senaryosu**

Burada belirlenen lifecycle sadece veri yönetimi için adımları içerir. İş akışı için yapılacak diğer işlemler ve kararlar WorkflowManager tarafından yönetilir.

1. **Instance Data Loading**: İş akışının instance verisi backend'den çekilir ve kaydedilir. `setData(DataContext.workflowInstance, key, data)`
2. **Form Schema Preparation**: İş akışının geçişi için gerekli form bilgileri transition'a bağlı JSONSchema'dan çekilir.
3. **Default Form Data Creation**: JSONSchema'dan varsayılan değerlerle boş form verisi oluşturulur ve transition data'sı olarak kaydedilir. `setData(DataContext.workflowTransition, key, data)`
4. **Form Data Binding**: Form widget'ları transition data'sına two-way binding ile bağlanır. `bindData(DataContext.workflowTransition, key, widget, BindingMode.twoWay)`
5. **Form Submission**: Form submit edildiğinde `getData(DataContext.workflowTransition, key)` ile veri çekilir ve backend servise submit edilir.
6. **Instance Data Update**: Başarılı submit sonrasında yeniden instance data'sı çekilir ve eski veri üzerine observability korunarak overwrite edilir. `setData(DataContext.workflowInstance, key, data)`


**TypeScript:**
```typescript
class LoanWorkflowHandler {
  constructor(
    private readonly dataManager: IDataManager,
    private readonly apiClient: IApiClient
  ) {}

  async loadInstanceData(instanceId: string): Promise<void> {
    const data = await this.apiClient.get(`/loan-application/${instanceId}`);
    // Storage: In-Memory + Cache (otomatik)
    this.dataManager.setData(
      DataContext.workflowInstance,
      `loan-application/${instanceId}`,
      data
    );
  }

  initTransitionForm(instanceId: string): void {
    // Storage: In-Memory (geçici, otomatik)
    this.dataManager.setData(
      DataContext.workflowTransition,
      `loan-application/${instanceId}/set-loan-term`,
      { term: 36, paymentPlan: "equalInstallments" }
    );
  }
}
```

**Flutter (Dart):**
```dart
class LoanWorkflowHandler {
  final IDataManager _dataManager;
  final IApiClient _apiClient;

  LoanWorkflowHandler(this._dataManager, this._apiClient);

  Future<void> loadInstanceData(String instanceId) async {
    final data = await _apiClient.get('/loan-application/$instanceId');
    // Storage: In-Memory + Cache (otomatik)
    _dataManager.setData(
      DataContext.workflowInstance,
      'loan-application/$instanceId',
      data
    );
  }

  void initTransitionForm(String instanceId) {
    // Storage: In-Memory (geçici, otomatik)
    _dataManager.setData(
      DataContext.workflowTransition,
      'loan-application/$instanceId/set-loan-term',
      {"term": 36, "paymentPlan": "equalInstallments"}
    );
  }
}
```

### **Device Veri Yönetimi Senaryosu**

**TypeScript:**
```typescript
class DeviceService {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  registerDevice(deviceId: string, installationId: string): void {
    // Device bilgileri - Secure Storage, şifresiz (bootstrap)
    this.dataManager.setData(DataContext.device, "info/deviceId", deviceId);
    this.dataManager.setData(DataContext.device, "info/installationId", installationId);
    this.dataManager.setData(DataContext.device, "info/platform", "web");
  }

  updateSettings(settings: DeviceSettings): void {
    this.dataManager.setData(DataContext.device, "settings", settings);
  }

  getDeviceId(): string | undefined {
    return this.dataManager.getData(DataContext.device, "info/deviceId");
  }

  bindTheme(themeComponent: any): void {
    this.dataManager.bindData(DataContext.device, "settings", themeComponent, BindingMode.oneWay, { dataPath: "theme" });
  }
}
```

**Flutter (Dart):**
```dart
class DeviceService {
  final IDataManager _dataManager;

  DeviceService(this._dataManager);

  void registerDevice(String deviceId, String installationId) {
    // Device bilgileri - Secure Storage, şifresiz (bootstrap)
    _dataManager.setData(DataContext.device, "info/deviceId", deviceId);
    _dataManager.setData(DataContext.device, "info/installationId", installationId);
    _dataManager.setData(DataContext.device, "info/platform", "ios");
  }

  void updateSettings(Map<String, dynamic> settings) {
    _dataManager.setData(DataContext.device, "settings", settings);
  }

  String? getDeviceId() {
    return _dataManager.getData(DataContext.device, "info/deviceId");
  }

  void bindTheme(Widget themeWidget) {
    _dataManager.bindData(DataContext.device, "settings", themeWidget, BindingMode.oneWay, dataPath: "theme");
  }
}
```

### **User Veri Yönetimi Senaryosu**

**TypeScript:**
```typescript
class UserProfileService {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  saveProfile(profile: UserProfile): void {
    // Secure Persistent (otomatik şifreli)
    this.dataManager.setData(DataContext.user, "profile", profile);
  }

  savePreferences(prefs: UserPreferences): void {
    // $ActiveUser → authorizationManager.activeUser üzerinden resolve edilir
    this.dataManager.setData(DataContext.user, "preferences/$ActiveUser", prefs);
  }

  getProfile(): UserProfile | undefined {
    return this.dataManager.getData(DataContext.user, "profile");
  }

  bindProfileToComponent(profileComponent: any): void {
    this.dataManager.bindData(DataContext.user, "profile", profileComponent, BindingMode.twoWay);
  }
}
```

**Flutter (Dart):**
```dart
class UserProfileService {
  final IDataManager _dataManager;

  UserProfileService(this._dataManager);

  void saveProfile(Map<String, dynamic> profile) {
    // Secure Persistent (otomatik şifreli)
    _dataManager.setData(DataContext.user, "profile", profile);
  }

  void savePreferences(Map<String, dynamic> prefs) {
    // $ActiveUser → authorizationManager.activeUser üzerinden resolve edilir
    _dataManager.setData(DataContext.user, "preferences/$ActiveUser", prefs);
  }

  Map<String, dynamic>? getProfile() {
    return _dataManager.getData(DataContext.user, "profile");
  }

  void bindProfileToWidget(Widget profileWidget) {
    _dataManager.bindData(DataContext.user, "profile", profileWidget, BindingMode.twoWay);
  }
}
```

### **Scope Veri Yönetimi Senaryosu**

Kurumsal uygulamalarda çalışan (`$ActiveUser`) başka bir müşteri (`$ActiveScope`) için işlem yapabilir. Bu değişkenler AuthorizationManager'daki aktif 2FA token'dan otomatik resolve edilir.

**TypeScript:**
```typescript
class CustomerScopeService {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  saveCustomerProfile(profile: CustomerProfile): void {
    // $ActiveScope → authorizationManager.activeScope (2FA token'dan "sub" claim)
    this.dataManager.setData(DataContext.scope, "customer/$ActiveScope/profile", profile);
  }

  addCustomerNote(note: CustomerNote): void {
    // $ActiveUser + $ActiveScope → AuthorizationManager'dan resolve edilir
    const notes = this.dataManager.getData<CustomerNote[]>(
      DataContext.scope, "notes/$ActiveUser/$ActiveScope"
    ) ?? [];
    notes.push(note);
    this.dataManager.setData(DataContext.scope, "notes/$ActiveUser/$ActiveScope", notes);
  }

  getCustomerProfile(): CustomerProfile | undefined {
    // → customer/C987654321/profile (runtime'da resolve)
    return this.dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile");
  }

  bindCustomerCard(customerCard: any): void {
    this.dataManager.bindData(DataContext.scope, "customer/$ActiveScope/profile", customerCard, BindingMode.oneWay);
  }
}
```

**Flutter (Dart):**
```dart
class CustomerScopeService {
  final IDataManager _dataManager;

  CustomerScopeService(this._dataManager);

  void saveCustomerProfile(Map<String, dynamic> profile) {
    // $ActiveScope → authorizationManager.activeScope (2FA token'dan "sub" claim)
    _dataManager.setData(DataContext.scope, "customer/$ActiveScope/profile", profile);
  }

  void addCustomerNote(Map<String, dynamic> note) {
    // $ActiveUser + $ActiveScope → AuthorizationManager'dan resolve edilir
    final notes = _dataManager.getData(DataContext.scope, "notes/$ActiveUser/$ActiveScope") as List? ?? [];
    notes.add(note);
    _dataManager.setData(DataContext.scope, "notes/$ActiveUser/$ActiveScope", notes);
  }

  Map<String, dynamic>? getCustomerProfile() {
    // → customer/C987654321/profile (runtime'da resolve)
    return _dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile");
  }

  void bindCustomerCard(Widget customerCard) {
    _dataManager.bindData(DataContext.scope, "customer/$ActiveScope/profile", customerCard, BindingMode.oneWay);
  }
}
```

### **Artifact Veri Yönetimi Senaryosu**

Render içerikleri, JSON dosyaları ve UI şablonları için kullanılır. **Storage: Local Persistent (TTL ile yönetilir)**

**TypeScript:**
```typescript
class ArtifactCacheService {
  constructor(
    private readonly dataManager: IDataManager,
    private readonly apiClient: IApiClient
  ) {}

  async cacheFormView(viewKey: string): Promise<void> {
    const view = await this.apiClient.get(`/artifacts/views/${viewKey}`);
    // Local Persistent + TTL (otomatik)
    this.dataManager.setData(DataContext.artifact, `views/${viewKey}`, view, { ttl: 60 * 60 * 1000 }); // 1 saat
  }

  async cacheNavigationMenu(): Promise<void> {
    const menu = await this.apiClient.get('/artifacts/navigation/main-menu');
    this.dataManager.setData(DataContext.artifact, "navigation/main-menu", menu, { ttl: 24 * 60 * 60 * 1000 }); // 24 saat
  }

  getFormView(viewKey: string): any {
    return this.dataManager.getData(DataContext.artifact, `views/${viewKey}`);
  }
}
```

**Flutter (Dart):**
```dart
class ArtifactCacheService {
  final IDataManager _dataManager;
  final IApiClient _apiClient;

  ArtifactCacheService(this._dataManager, this._apiClient);

  Future<void> cacheFormView(String viewKey) async {
    final view = await _apiClient.get('/artifacts/views/$viewKey');
    // Local Persistent + TTL (otomatik)
    _dataManager.setData(DataContext.artifact, 'views/$viewKey', view, ttl: Duration(hours: 1));
  }

  Future<void> cacheNavigationMenu() async {
    final menu = await _apiClient.get('/artifacts/navigation/main-menu');
    _dataManager.setData(DataContext.artifact, "navigation/main-menu", menu, ttl: Duration(hours: 24));
  }

  dynamic getFormView(String viewKey) {
    return _dataManager.getData(DataContext.artifact, 'views/$viewKey');
  }
}
```

### **Event Delegation Senaryoları**

**TypeScript:**
```typescript
class ThemeWatcher {
  constructor(
    private readonly dataManager: IDataManager
  ) {
    // Constructor'da listener kaydet
    this.dataManager.addListener(
      "themeListener",
      DataContext.user,
      "preferences",
      (preferences) => this.onThemeChanged(preferences),
      { dataPath: "theme" }
    );

    // $ActiveScope → AuthorizationManager'dan otomatik resolve edilir
    this.dataManager.addListener(
      "customerListener",
      DataContext.scope,
      "customer/$ActiveScope/profile",
      (profile) => this.onCustomerUpdated(profile)
    );
  }

  private onThemeChanged(theme: string): void {
    console.log("Theme changed:", theme);
  }

  private onCustomerUpdated(profile: any): void {
    console.log("Customer profile updated:", profile);
  }

  dispose(): void {
    this.dataManager.removeListener("themeListener");
    this.dataManager.removeListener("customerListener");
  }
}
```

**Flutter (Dart):**
```dart
class ThemeWatcher {
  final IDataManager _dataManager;

  ThemeWatcher(this._dataManager) {
    // Constructor'da listener kaydet
    _dataManager.addListener(
      "themeListener",
      DataContext.user,
      "preferences",
      (preferences) => _onThemeChanged(preferences),
      dataPath: "theme"
    );

    // $ActiveScope → AuthorizationManager'dan otomatik resolve edilir
    _dataManager.addListener(
      "customerListener",
      DataContext.scope,
      "customer/$ActiveScope/profile",
      (profile) => _onCustomerUpdated(profile)
    );
  }

  void _onThemeChanged(dynamic theme) {
    print("Theme changed: $theme");
  }

  void _onCustomerUpdated(dynamic profile) {
    print("Customer profile updated: $profile");
  }

  void dispose() {
    _dataManager.removeListener("themeListener");
    _dataManager.removeListener("customerListener");
  }
}
```

### **Data Binding Senaryoları**

**TypeScript (Vue/React):**
```typescript
class LoanApplicationView {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  bindFormFields(instanceId: string, components: LoanFormComponents): void {
    const instanceKey = `loan-application/${instanceId}`;
    const transitionKey = `loan-application/${instanceId}/set-loan-term`;

    // 1. SINGLE FIELD BINDING - Readonly display
    this.dataManager.bindData(
      DataContext.workflowInstance, instanceKey,
      components.firstNameInput, BindingMode.readOnly,
      { dataPath: "applicant.firstName" }
    );

    // 2. COMPOSITE FIELD BINDING (ONE-WAY/READONLY)
    this.dataManager.bindCompositeData(
      DataContext.workflowInstance, instanceKey,
      ["applicant.firstName", "applicant.lastName"],
      (values) => `${values[0] ?? ""} ${values[1] ?? ""}`.trim(),
      components.fullNameLabel
    );

    // 3. MULTI-CONTEXT COMPOSITE BINDING - Cross-context
    // $ActiveScope → AuthorizationManager'dan resolve edilir
    this.dataManager.bindMultiContextData(
      [
        [DataContext.workflowInstance, instanceKey, "applicant.firstName"],
        [DataContext.user, "preferences", "language"],
        [DataContext.scope, "customer/$ActiveScope/profile", "firstName"],
      ],
      (values) => {
        const [applicantName, language, customerName] = values;
        return language === "tr"
          ? `Sayın ${customerName}, başvuran: ${applicantName}`
          : `Dear ${customerName}, applicant: ${applicantName}`;
      },
      components.greetingLabel
    );

    // 4. TWO-WAY BINDING - Form input
    this.dataManager.bindData(
      DataContext.workflowTransition, transitionKey,
      components.termInput, BindingMode.twoWay,
      { dataPath: "term" }
    );
  }
}
```

**Flutter (Dart):**
```dart
class LoanApplicationView {
  final IDataManager _dataManager;

  LoanApplicationView(this._dataManager);

  void bindFormFields(String instanceId, LoanFormWidgets widgets) {
    final instanceKey = 'loan-application/$instanceId';
    final transitionKey = 'loan-application/$instanceId/set-loan-term';

    // 1. SINGLE FIELD BINDING - Readonly display
    _dataManager.bindData(
      DataContext.workflowInstance, instanceKey,
      widgets.firstNameInput, BindingMode.readOnly,
      dataPath: "applicant.firstName"
    );

    // 2. COMPOSITE FIELD BINDING (ONE-WAY/READONLY)
    _dataManager.bindCompositeData(
      DataContext.workflowInstance, instanceKey,
      ["applicant.firstName", "applicant.lastName"],
      (values) => "${values[0] ?? ''} ${values[1] ?? ''}".trim(),
      widgets.fullNameLabel
    );

    // 3. MULTI-CONTEXT COMPOSITE BINDING - Cross-context
    // $ActiveScope → AuthorizationManager'dan resolve edilir
    _dataManager.bindMultiContextData(
      [
        (DataContext.workflowInstance, instanceKey, "applicant.firstName"),
        (DataContext.user, "preferences", "language"),
        (DataContext.scope, "customer/$ActiveScope/profile", "firstName"),
      ],
      (values) {
        final applicantName = values[0] ?? "Guest";
        final language = values[1] ?? "en";
        final customerName = values[2] ?? "";
        return language == "tr"
          ? "Sayın $customerName, başvuran: $applicantName"
          : "Dear $customerName, applicant: $applicantName";
      },
      widgets.greetingLabel
    );

    // 4. TWO-WAY BINDING - Form input
    _dataManager.bindData(
      DataContext.workflowTransition, transitionKey,
      widgets.termInput, BindingMode.twoWay,
      dataPath: "term"
    );
  }
}
```

### **Batch Operations Senaryoları**

**TypeScript:**
```typescript
class ProfileFormHandler {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  submitProfile(profile: ProfileData): void {
    // $ActiveScope → AuthorizationManager'dan resolve edilir
    this.dataManager.batchSet([
      { context: DataContext.user, key: "profile/name", value: profile.name },
      { context: DataContext.user, key: "profile/email", value: profile.email },
      { context: DataContext.user, key: "profile/age", value: profile.age },
      { context: DataContext.scope, key: "customer/$ActiveScope/lastContact", value: new Date() }
    ]);
  }

  loadProfile(): { name: string; email: string; deviceId: string } {
    const results = this.dataManager.batchGet([
      { context: DataContext.user, key: "profile/name" },
      { context: DataContext.user, key: "profile/email" },
      { context: DataContext.device, key: "info/deviceId" }
    ]);
    return { name: results[0].value, email: results[1].value, deviceId: results[2].value };
  }

  bindLoanForm(instanceId: string, components: LoanFormComponents): void {
    this.dataManager.batchBind(
      DataContext.workflowTransition,
      `loan-app/${instanceId}/application-form`,
      BindingMode.twoWay,
      [
        { dataPath: "applicant.firstName", component: components.firstNameInput },
        { dataPath: "applicant.lastName", component: components.lastNameInput },
        { dataPath: "applicant.email", component: components.emailInput },
        { dataPath: "loan.amount", component: components.amountInput },
        { dataPath: "loan.term", component: components.termInput },
        { dataPath: "agreement.terms", component: components.termsCheckbox }
      ]
    );
  }
}
```

**Flutter (Dart):**
```dart
class ProfileFormHandler {
  final IDataManager _dataManager;

  ProfileFormHandler(this._dataManager);

  void submitProfile(Map<String, dynamic> profile) {
    // $ActiveScope → AuthorizationManager'dan resolve edilir
    _dataManager.batchSet([
      (DataContext.user, "profile/name", profile['name']),
      (DataContext.user, "profile/email", profile['email']),
      (DataContext.user, "profile/age", profile['age']),
      (DataContext.scope, "customer/$ActiveScope/lastContact", DateTime.now())
    ]);
  }

  Map<String, dynamic> loadProfile() {
    final results = _dataManager.batchGet([
      (DataContext.user, "profile/name"),
      (DataContext.user, "profile/email"),
      (DataContext.device, "info/deviceId")
    ]);
    return {'name': results[0].$3, 'email': results[1].$3, 'deviceId': results[2].$3};
  }

  void bindLoanForm(String instanceId, LoanFormWidgets widgets) {
    _dataManager.batchBind(
      DataContext.workflowTransition,
      'loan-app/$instanceId/application-form',
      BindingMode.twoWay,
      [
        ("applicant.firstName", widgets.firstNameInput),
        ("applicant.lastName", widgets.lastNameInput),
        ("applicant.email", widgets.emailInput),
        ("loan.amount", widgets.amountInput),
        ("loan.term", widgets.termInput),
        ("agreement.terms", widgets.termsCheckbox)
      ]
    );
  }
}
```

### **Data Migration Senaryoları**

**TypeScript:**
```typescript
class DataMigrationService {
  constructor(
    private readonly dataManager: IDataManager
  ) {}

  async migrateToV2(): Promise<void> {
    // 1. Export old data
    const userBackup = this.dataManager.exportData(DataContext.user);
    const deviceBackup = this.dataManager.exportData(DataContext.device);

    // 2. Transform data (business logic)
    const transformedUser = MigrationService.transformUserData(userBackup, "1.0", "2.0");
    const transformedDevice = MigrationService.transformDeviceData(deviceBackup, "1.0", "2.0");

    // 3. Import transformed data
    this.dataManager.importData(DataContext.user, transformedUser);
    this.dataManager.importData(DataContext.device, transformedDevice);
  }

  backupPreferences(): Record<string, any> {
    return this.dataManager.exportData(DataContext.user, { partialKey: "preferences" });
  }

  restoreFromBackup(backup: Record<string, any>): void {
    this.dataManager.importData(DataContext.user, backup, { overwrite: false });
  }
}
```

**Flutter (Dart):**
```dart
class DataMigrationService {
  final IDataManager _dataManager;

  DataMigrationService(this._dataManager);

  Future<void> migrateToV2() async {
    // 1. Export old data
    final userBackup = _dataManager.exportData(DataContext.user);
    final deviceBackup = _dataManager.exportData(DataContext.device);

    // 2. Transform data (business logic)
    final transformedUser = MigrationService.transformUserData(userBackup, "1.0", "2.0");
    final transformedDevice = MigrationService.transformDeviceData(deviceBackup, "1.0", "2.0");

    // 3. Import transformed data
    _dataManager.importData(DataContext.user, transformedUser);
    _dataManager.importData(DataContext.device, transformedDevice);
  }

  Map<String, dynamic> backupPreferences() {
    return _dataManager.exportData(DataContext.user, partialKey: "preferences");
  }

  void restoreFromBackup(Map<String, dynamic> backup) {
    _dataManager.importData(DataContext.user, backup, overwrite: false);
  }
}
```



## 🔧 **DataManager Public Interface**

### **TypeScript Interface**

```typescript
/**
 * DataContext - Veri bağlamını ve storage altyapısını belirler
 * 
 * Storage Altyapıları:
 * - Secure Storage: iOS Keychain, Android EncryptedSharedPreferences (güvenli)
 * - Local Storage: localStorage, SharedPreferences, UserDefaults (cache için)
 * - In-Memory: RAM (persist edilmez)
 * 
 * Context → Storage Mapping:
 * - device: Secure Storage (şifrelenmez - bootstrap için gerekli)
 * - user: Secure Storage + Encrypted
 * - scope: Secure Storage + Encrypted
 * - workflowInstance: In-Memory
 * - workflowTransition: In-Memory
 * - artifact: Local Storage (cache, TTL ile)
 * - secureMemory: In-Memory ONLY (asla persist edilmez)
 * 
 * ⚠️ Encryption key Device Register'dan alınır ve secureMemory'de tutulur
 */
enum DataContext {
  device,             // Cihaz verileri - Secure Storage (NO encryption - bootstrap)
  user,               // Kullanıcı verileri - Secure Storage + Encrypted
  scope,              // İşlem yapılan müşteri/kapsam - Secure Storage + Encrypted
  workflowInstance,   // İş akışı instance - In-Memory
  workflowTransition, // Form/transition verisi - In-Memory
  artifact,           // Render içerikleri, JSON - Local Storage (cache)
  secureMemory        // Hassas runtime verileri (encryption key) - In-Memory ONLY
}

enum BindingMode {
  oneWay,    // Read-only binding
  twoWay,    // Read-write binding
  readOnly   // Read-only binding (alias for oneWay)
}

interface DataManager {
  // ===== DI BAĞIMLILIKLARI =====
  
  // DataManager, $ActiveUser ve $ActiveScope dinamik değişkenlerini
  // AuthorizationManager'dan resolve eder. Constructor injection ile alınır:
  //
  //   constructor(
  //     private readonly authorizationManager: IAuthorizationManager
  //   )
  //
  // authorizationManager.activeUser  → $ActiveUser
  // authorizationManager.activeScope → $ActiveScope
  
  // ===== UNIFIED DATA METHODS =====
  
  // Universal data operations for ALL contexts
  // Key examples:
  // - Simple: "preferences", "settings", "profile"
  // - Dynamic: "preferences/$ActiveUser/theme", "customer/$ActiveScope/profile"
  // - Workflow instance: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3"
  // - Workflow transition: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3/apply"
  // 
  // ⚠️ STORAGE NOTU: Storage türü DataContext'e göre otomatik belirlenir.
  // - user, scope → Secure Persistent (şifreli, secureStorage.md referansı)
  // - device → Local Persistent (şifrelenmemiş)
  // - workflowInstance, artifact → In-Memory + Cache
  // - workflowTransition → In-Memory (geçici)
  setData(context: DataContext, key: string, value: any, options?: { ttl?: number, dataPath?: string }): void;
  getData<T = any>(context: DataContext, key: string, options?: { dataPath?: string }): T | undefined;
  deleteData(context: DataContext, key: string, options?: { dataPath?: string }): void;
  
  // Batch operations for performance
  batchSet(operations: Array<{ context: DataContext, key: string, value: any, ttl?: number }>): void;
  batchGet(operations: Array<{ context: DataContext, key: string }>): Array<{ context: DataContext, key: string, value: any }>;
  
  // ===== BINDING METHODS =====
  
  // Universal binding for ALL contexts
  // Component: Vue component ref, React state setter, or any reactive object
  // DataPath examples for complex objects:
  // - "applicant.firstName" (bind to nested property)
  // - "items[0].name" (bind to array element property)
  // - "settings.theme.colors.primary" (bind to deep nested property)
  // Key supports dynamic variables: $ActiveUser, $ActiveScope
  bindData(context: DataContext, key: string, component: any, mode: BindingMode, options?: { dataPath?: string }): void;
  
  // Composite binding - Multiple fields combined and bound to component
  // ⚠️ NOT: Composite binding her zaman ONE-WAY/READONLY'dir - birden fazla field combine edildiği için
  bindCompositeData(
    context: DataContext,
    key: string,
    dataPaths: string[],
    combiner: (values: any[]) => any,
    component: any
  ): void;
  
  // Multi-context composite binding - Cross-context data combination
  bindMultiContextData(
    sourcePathPairs: Array<[DataContext, string, string]>,  // [context, key, dataPath]
    combiner: (values: any[]) => any,
    component: any
  ): void;
  
  // Batch binding for forms
  batchBind(
    context: DataContext,
    key: string,
    mode: BindingMode,
    bindings: Array<{ dataPath: string, component: any }>
  ): void;
  
  // ===== EVENT DELEGATION METHODS =====
  
  // Observable/Stream-based event listening - Advanced scenarios için
  observeData(context: DataContext, key: string, options?: { dataPath?: string }): Observable<any>;
  observeDataWhere(context: DataContext, key: string, condition: (value: any) => boolean, options?: { dataPath?: string }): Observable<any>;
    
  // Business logic delegation - Built into DataManager
  addListener(listenerId: string, context: DataContext, key: string, callback: (value: any) => void, options?: { dataPath?: string }): void;
  removeListener(listenerId: string): void;
  clearAllListeners(): void;
  
  // ===== UTILITY METHODS =====
  
  // Search and discovery
  findKeys(context: DataContext, partialKey: string): string[];
  
  // TTL management  
  getExpirationTime(context: DataContext, key: string): Date | undefined;
  
  // Cleanup operations
  clearData(context: DataContext, options?: { partialKey?: string }): void;
  
  // ===== DATA MIGRATION METHODS =====
  
  // Export/Import for version upgrades
  exportData(context: DataContext, options?: { partialKey?: string }): Record<string, any>;
  importData(context: DataContext, data: Record<string, any>, options?: { overwrite?: boolean }): void;
}
```

### **Flutter (Dart) Interface**

```dart
/// DataContext - Veri bağlamını ve storage altyapısını belirler
/// 
/// Storage Altyapıları:
/// - Secure Storage: iOS Keychain, Android EncryptedSharedPreferences (güvenli)
/// - Local Storage: localStorage, SharedPreferences, UserDefaults (cache için)
/// - In-Memory: RAM (persist edilmez)
/// 
/// Context → Storage Mapping:
/// - device: Secure Storage (şifrelenmez - bootstrap için gerekli)
/// - user: Secure Storage + Encrypted
/// - scope: Secure Storage + Encrypted
/// - workflowInstance: In-Memory
/// - workflowTransition: In-Memory
/// - artifact: Local Storage (cache, TTL ile)
/// - secureMemory: In-Memory ONLY (asla persist edilmez)
/// 
/// ⚠️ Encryption key Device Register'dan alınır ve secureMemory'de tutulur
enum DataContext {
  device,             // Cihaz verileri - Secure Storage (NO encryption - bootstrap)
  user,               // Kullanıcı verileri - Secure Storage + Encrypted
  scope,              // İşlem yapılan müşteri/kapsam - Secure Storage + Encrypted
  workflowInstance,   // İş akışı instance - In-Memory
  workflowTransition, // Form/transition verisi - In-Memory
  artifact,           // Render içerikleri, JSON - Local Storage (cache)
  secureMemory        // Hassas runtime verileri (encryption key) - In-Memory ONLY
}

enum BindingMode {
  oneWay,    // Read-only binding
  twoWay,    // Read-write binding
  readOnly   // Read-only binding (alias for oneWay)
}

class DataManager {
  // ===== DI BAĞIMLILIKLARI =====
  
  // DataManager, $ActiveUser ve $ActiveScope dinamik değişkenlerini
  // AuthorizationManager'dan resolve eder. Constructor injection ile alınır:
  //
  //   DataManager(this._authorizationManager);
  //   final IAuthorizationManager _authorizationManager;
  //
  // _authorizationManager.activeUser  → $ActiveUser
  // _authorizationManager.activeScope → $ActiveScope
  
  // ===== UNIFIED DATA METHODS =====
  
  // Universal data operations for ALL contexts
  // Key examples:
  // - Simple: "preferences", "settings", "profile"
  // - Dynamic: "preferences/$ActiveUser/theme", "customer/$ActiveScope/profile"
  // - Workflow instance: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3"
  // - Workflow transition: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3/apply"
  // 
  // ⚠️ STORAGE NOTU: Storage türü DataContext'e göre otomatik belirlenir.
  // - user, scope → Secure Persistent (şifreli, secureStorage.md referansı)
  // - device → Local Persistent (şifrelenmemiş)
  // - workflowInstance, artifact → In-Memory + Cache
  // - workflowTransition → In-Memory (geçici)
  void setData(DataContext context, String key, dynamic value, {Duration? ttl, String? dataPath});
  dynamic getData(DataContext context, String key, {String? dataPath});
  void deleteData(DataContext context, String key, {String? dataPath});
  
  // Batch operations for performance
  void batchSet(List<(DataContext context, String key, dynamic value, Duration? ttl)> operations);
  List<(DataContext context, String key, dynamic value)> batchGet(List<(DataContext context, String key)> operations);
  
  // ===== BINDING METHODS =====
  
  // Universal binding for ALL contexts
  // Widget: Flutter widget (Text, TextField, etc.)
  // DataPath examples for complex objects:
  // - "applicant.firstName" (bind to nested property)
  // - "items[0].name" (bind to array element property)
  // - "settings.theme.colors.primary" (bind to deep nested property)
  // Key supports dynamic variables: $ActiveUser, $ActiveScope
  void bindData(DataContext context, String key, Widget widget, BindingMode mode, {String? dataPath});
  
  // Composite binding - Multiple fields combined and bound to widget
  // ⚠️ NOT: Composite binding her zaman ONE-WAY/READONLY'dir - birden fazla field combine edildiği için
  void bindCompositeData(
    DataContext context, 
    String key, 
    List<String> dataPaths, 
    String Function(List<dynamic> values) combiner,
    Widget widget
  );
  
  // Multi-context composite binding - Cross-context data combination
  void bindMultiContextData(
    List<(DataContext context, String key, String dataPath)> sourcePathPairs,
    dynamic Function(List<dynamic> values) combiner,
    Widget widget
  );
  
  // Batch binding for forms
  void batchBind(DataContext context, String key, BindingMode mode, List<(String dataPath, Widget widget)> bindings);
  
  // ===== EVENT DELEGATION METHODS (BLOC PATTERN) =====
  
  // Stream-based event listening - Advanced scenarios için
  Stream<dynamic> observeData(DataContext context, String key, {String? dataPath});
  Stream<dynamic> observeDataWhere(DataContext context, String key, bool Function(dynamic value) condition, {String? dataPath});
    
  // Business logic delegation - Built into DataManager
  void addListener(String listenerId, DataContext context, String key, void Function(dynamic value) callback, {String? dataPath});
  void removeListener(String listenerId);
  void clearAllListeners();
  
  // ===== UTILITY METHODS =====
  
  // Search and discovery
  List<String> findKeys(DataContext context, String partialKey);
  
  // TTL management  
  DateTime? getExpirationTime(DataContext context, String key);
  
  // Cleanup operations
  void clearData(DataContext context, {String? partialKey});
  
  // ===== DATA MIGRATION METHODS =====
  
  // Export/Import for version upgrades
  Map<String, dynamic> exportData(DataContext context, {String? partialKey});
  void importData(DataContext context, Map<String, dynamic> data, {bool overwrite = false});
}
```

---

## 📝 Gelecek İyileştirmeler (İlerde Değerlendirilecek)

> **Not:** Aşağıdaki özellikler ilerde değerlendirilecek, şimdilik not olarak tutulmaktadır.

### Önerilen Özellikler

1. **Type Safety (TypeScript)**: Generic type support ile compile-time type checking
2. **Query/Filter API**: State'leri filtreleme ve sorgulama yetenekleri
3. **Transaction Support**: Atomic operations (ya hepsi ya hiçbiri)
4. **Conflict Resolution**: Multi-tab/window senaryoları için conflict handling
5. **DevTools/Inspector**: Development mode'da state tree görüntüleme ve debugging
6. **Middleware/Plugin System**: Logging, analytics gibi cross-cutting concerns için
7. **Offline-First Support**: Queue operations when offline, sync on online
8. **Performance Optimizations**: Lazy loading, memoization, batch optimizations
9. **Schema Validation**: JSON Schema/Zod validation support
10. **Platform-Specific Optimizations**: Web (IndexedDB, Web Workers) ve Flutter (Isolate, SQLite) için optimize edilmiş implementasyonlar
