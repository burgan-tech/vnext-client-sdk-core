# Data Manager

Uygulamanın **merkezi state store**'unu sağlayan core SDK sınıfıdır. Hem TypeScript (web) hem de Flutter (mobil) platformlarında aynı interface ve davranışı sağlar.

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

| Context | Storage | Encryption | Açıklama |
|---------|---------|------------|----------|
| `device` | Local Persistent | ❌ | Cihaz bilgileri (deviceId, installationId). Bootstrap için şifresiz! |
| `user` | Local Persistent | ✅ Şifreli | Kullanıcı verileri (profile, tokens, preferences) |
| `scope` | Local Persistent | ✅ Şifreli | İşlem yapılan müşteri/kapsam verileri |
| `workflowInstance` | In-Memory | ❌ | İş akışı instance verisi (geçici) |
| `workflowTransition` | In-Memory | ❌ | Form/transition verisi (geçici) |
| `artifact` | Local Persistent | ❌ | Render içerikleri, JSON dosyaları (TTL ile, hassas değil) |
| `secureMemory` | In-Memory | ❌ | Hassas runtime verileri (encryption key). ASLA persist edilmez! |

> **⚠️ Storage Otomatik Belirlenir**: DataManager, context'e göre hangi storage kullanılacağını otomatik belirler. Geliştiricinin storage türünü belirtmesine gerek yoktur.

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

### Secure Storage API (Tutarlı setData/getData)

Artık özel `unlockSecureStorage()` metoduna gerek yok - tutarlı API!

**TypeScript:**
```typescript
// Encryption key yazma (Device Register sonrası)
dataManager.setData(DataContext.secureMemory, "encryption/key", encryptionKey);

// Secure storage durumu kontrolü
const isUnlocked = dataManager.getData(DataContext.secureMemory, "encryption/key") !== undefined;

// Logout - key'i sil (opsiyonel, app kapanınca zaten silinir)
dataManager.deleteData(DataContext.secureMemory, "encryption/key");
```

**Flutter (Dart):**
```dart
// Encryption key yazma (Device Register sonrası)
dataManager.setData(DataContext.secureMemory, "encryption/key", encryptionKey);

// Secure storage durumu kontrolü
final isUnlocked = dataManager.getData(DataContext.secureMemory, "encryption/key") != null;

// Logout - key'i sil (opsiyonel, app kapanınca zaten silinir)
dataManager.deleteData(DataContext.secureMemory, "encryption/key");
```

### Kullanım Örneği

**TypeScript:**
```typescript
// SDK initialization flow
async function initializeApp() {
  // 1. Device register - x-autoStore ile encryptionKey otomatik secureMemory'ye yazılır
  const response = await authManager.deviceRegister({
    deviceId: getDeviceId(),
    installationId: getInstallationId(),
    platform: "web"
  });
  
  // 2. Key otomatik olarak secureMemory'ye yazıldı (x-autoStore sayesinde)
  // Manuel yazmak isterseniz:
  // dataManager.setData(DataContext.secureMemory, "encryption/key", response.encryptionKey);
  
  // 3. Artık tüm context'lere erişilebilir
  const userProfile = dataManager.getData(DataContext.user, "profile");
  const deviceSettings = dataManager.getData(DataContext.device, "settings");
}

// Logout flow
function logout() {
  // secureMemory'yi temizle (key silinir)
  dataManager.clearData(DataContext.secureMemory);
  
  // Kullanıcı verilerini temizle (opsiyonel)
  dataManager.clearData(DataContext.user);
  dataManager.clearData(DataContext.scope);
}
```

**Flutter (Dart):**
```dart
// SDK initialization flow
Future<void> initializeApp() async {
  // 1. Device register - x-autoStore ile encryptionKey otomatik secureMemory'ye yazılır
  final response = await authManager.deviceRegister(
    deviceId: getDeviceId(),
    installationId: getInstallationId(),
    platform: "ios"
  );
  
  // 2. Key otomatik olarak secureMemory'ye yazıldı (x-autoStore sayesinde)
  // Manuel yazmak isterseniz:
  // dataManager.setData(DataContext.secureMemory, "encryption/key", response.encryptionKey);
  
  // 3. Artık tüm context'lere erişilebilir
  final userProfile = dataManager.getData(DataContext.user, "profile");
  final deviceSettings = dataManager.getData(DataContext.device, "settings");
}

// Logout flow
void logout() {
  // secureMemory'yi temizle (key silinir)
  dataManager.clearData(DataContext.secureMemory);
  
  // Kullanıcı verilerini temizle (opsiyonel)
  dataManager.clearData(DataContext.user);
  dataManager.clearData(DataContext.scope);
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

Key'lerde iki dinamik değişken kullanılabilir:

| Değişken | Açıklama | Örnek Değer |
|----------|----------|-------------|
| `$ActiveUser` | Login olmuş kullanıcı (çalışan, temsilci) | `"employee123"` |
| `$ActiveScope` | İşlem yapılan müşteri/kapsam | `"C987654321"` |

**Kullanım örneği:**
```typescript
// Çalışanın kendi tercihleri
dataManager.getData(DataContext.user, "preferences/$ActiveUser/theme");
// → "preferences/employee123/theme"

// İşlem yapılan müşterinin bilgileri
dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile");
// → "customer/C987654321/profile"

// Çalışanın, müşteri için açtığı notlar
dataManager.getData(DataContext.scope, "notes/$ActiveUser/$ActiveScope");
// → "notes/employee123/C987654321"
```

### State Adresleme

* **Context-based**: State ownership ve storage DataContext enum ile belirlenir
* **Key-based**: Her context içinde unique string key ile state adreslenebilir
* **Path-based**: Slash notation ile hiyerarşik state yapısı (örn: "loan-app/instance-id/transition-name")
* **DataPath-based**: Kompleks state object'lerin içindeki spesifik property'lere erişim (örn: "applicant.firstName")

**State Adresleme Örneği:**

**TypeScript:**
```typescript
// Context: user, Key: preferences, DataPath: theme
dataManager.getData(DataContext.user, "preferences", { dataPath: "theme" });

// Dinamik değişken ile
dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile", { dataPath: "firstName" });
```

**Flutter (Dart):**
```dart
// Context: user, Key: preferences, DataPath: theme
dataManager.getData(DataContext.user, "preferences", dataPath: "theme");

// Dinamik değişken ile
dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile", dataPath: "firstName");
```




## 💡 Kullanım Senaryoları

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
// İş akışı instance data'sı backend'den okunup kaydediliyor.
// Storage: In-Memory + Cache (otomatik)
// Data type: any (Record, Array, string, number, boolean her şey olabilir)
dataManager.setData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  {
    applicationNo: 345345534534,
    applicant: {
      firstname: "Ugur", 
      lastname: "karatas",
      mobile: "905302896073"
    }
  }
);

// İş akışı transition form data'sı oluşturuluyor.
// Storage: In-Memory (geçici, otomatik)
// Data type: any - Flexible data structure
dataManager.setData(
  DataContext.workflowTransition,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  {
    term: 36,
    paymentPlan: "equalInstallments"
  }
);
```

**Flutter (Dart):**
```dart
// İş akışı instance data'sı backend'den okunup kaydediliyor.
// Storage: In-Memory + Cache (otomatik)
// Data type: dynamic (Map, List, String, int, bool her şey olabilir)
dataManager.setData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  {
    "applicationNo": 345345534534,
    "applicant": {
      "firstname": "Ugur", 
      "lastname": "karatas",
      "mobile": "905302896073"
    }
  }
);

// İş akışı transition form data'sı oluşturuluyor.
// Storage: In-Memory (geçici, otomatik)
// Data type: dynamic - Flexible data structure
dataManager.setData(
  DataContext.workflowTransition,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  {
    "term": 36,
    "paymentPlan": "equalInstallments"
  }
);
```

### **Device Veri Yönetimi Senaryosu**

**TypeScript:**
```typescript
// Device bilgileri - Local Persistent (otomatik)
dataManager.setData(DataContext.device, "info/deviceId", "device-uuid-12345");
dataManager.setData(DataContext.device, "info/installationId", "install-uuid-67890");
dataManager.setData(DataContext.device, "info/platform", "web");

// Device ayarları - Local Persistent (otomatik)
dataManager.setData(DataContext.device, "settings", { 
  language: "tr", 
  theme: "dark", 
  notifications: true 
});

// Device verisi okuma
const deviceId = dataManager.getData(DataContext.device, "info/deviceId");
const settings = dataManager.getData(DataContext.device, "settings");

// Vue/React component'ları bindData() ile otomatik reactive olur
dataManager.bindData(DataContext.device, "settings", themeComponent, BindingMode.oneWay, { dataPath: "theme" });
```

**Flutter (Dart):**
```dart
// Device bilgileri - Local Persistent (otomatik)
dataManager.setData(DataContext.device, "info/deviceId", "device-uuid-12345");
dataManager.setData(DataContext.device, "info/installationId", "install-uuid-67890");
dataManager.setData(DataContext.device, "info/platform", "ios");

// Device ayarları - Local Persistent (otomatik)
dataManager.setData(DataContext.device, "settings", { 
  "language": "tr", 
  "theme": "dark", 
  "notifications": true 
});

// Device verisi okuma
final deviceId = dataManager.getData(DataContext.device, "info/deviceId");
final settings = dataManager.getData(DataContext.device, "settings");

// Widget'lar bindData() ile otomatik reactive olur
dataManager.bindData(DataContext.device, "settings", themeWidget, BindingMode.oneWay, dataPath: "theme");
```

### **User Veri Yönetimi Senaryosu**

**TypeScript:**
```typescript
// User profil ve token verileri - Secure Persistent (otomatik şifreli)
dataManager.setData(DataContext.user, "auth/session", { 
  userId: "user-123", 
  token1fa: "jwt-token-1fa",
  token2fa: "jwt-token-2fa"
});
dataManager.setData(DataContext.user, "profile", { 
  firstName: "Ugur", 
  lastName: "Karatas",
  email: "ugur@example.com" 
});

// Kullanıcı tercihleri - Secure Persistent (otomatik şifreli)
dataManager.setData(DataContext.user, "preferences/$ActiveUser", { 
  theme: "dark", 
  language: "tr",
  notifications: true 
});

// User verisi okuma
const session = dataManager.getData(DataContext.user, "auth/session");
const profile = dataManager.getData(DataContext.user, "profile");

// Binding
dataManager.bindData(DataContext.user, "profile", profileComponent, BindingMode.twoWay);
```

**Flutter (Dart):**
```dart
// User profil ve token verileri - Secure Persistent (otomatik şifreli)
dataManager.setData(DataContext.user, "auth/session", { 
  "userId": "user-123", 
  "token1fa": "jwt-token-1fa",
  "token2fa": "jwt-token-2fa"
});
dataManager.setData(DataContext.user, "profile", { 
  "firstName": "Ugur", 
  "lastName": "Karatas",
  "email": "ugur@example.com" 
});

// Kullanıcı tercihleri - Secure Persistent (otomatik şifreli)
dataManager.setData(DataContext.user, "preferences/$ActiveUser", { 
  "theme": "dark", 
  "language": "tr",
  "notifications": true 
});

// User verisi okuma
final session = dataManager.getData(DataContext.user, "auth/session");
final profile = dataManager.getData(DataContext.user, "profile");

// Binding
dataManager.bindData(DataContext.user, "profile", profileWidget, BindingMode.twoWay);
```

### **Scope Veri Yönetimi Senaryosu**

Kurumsal uygulamalarda çalışan ($ActiveUser) başka bir müşteri ($ActiveScope) için işlem yapabilir.

**TypeScript:**
```typescript
// İşlem yapılan müşterinin bilgileri - Secure Persistent (otomatik şifreli)
dataManager.setData(DataContext.scope, "customer/$ActiveScope/profile", { 
  customerId: "C987654321",
  firstName: "Mehmet",
  lastName: "Yılmaz",
  segment: "retail"
});

// Çalışanın müşteri için tuttuğu notlar
dataManager.setData(DataContext.scope, "notes/$ActiveUser/$ActiveScope", [
  { id: 1, text: "Kredi başvurusu görüşüldü", date: "2025-01-15" },
  { id: 2, text: "Ek belge istendi", date: "2025-01-16" }
]);

// Scope verisi okuma - dinamik değişkenler runtime'da resolve edilir
const customerProfile = dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile");
// → customer/C987654321/profile

// Binding
dataManager.bindData(DataContext.scope, "customer/$ActiveScope/profile", customerCard, BindingMode.oneWay);
```

**Flutter (Dart):**
```dart
// İşlem yapılan müşterinin bilgileri - Secure Persistent (otomatik şifreli)
dataManager.setData(DataContext.scope, "customer/$ActiveScope/profile", { 
  "customerId": "C987654321",
  "firstName": "Mehmet",
  "lastName": "Yılmaz",
  "segment": "retail"
});

// Çalışanın müşteri için tuttuğu notlar
dataManager.setData(DataContext.scope, "notes/$ActiveUser/$ActiveScope", [
  {"id": 1, "text": "Kredi başvurusu görüşüldü", "date": "2025-01-15"},
  {"id": 2, "text": "Ek belge istendi", "date": "2025-01-16"}
]);

// Scope verisi okuma - dinamik değişkenler runtime'da resolve edilir
final customerProfile = dataManager.getData(DataContext.scope, "customer/$ActiveScope/profile");
// → customer/C987654321/profile

// Binding
dataManager.bindData(DataContext.scope, "customer/$ActiveScope/profile", customerCard, BindingMode.oneWay);
```

### **Artifact Veri Yönetimi Senaryosu**

Render içerikleri, JSON dosyaları ve UI şablonları için kullanılır. **Storage: Local Persistent (TTL ile yönetilir)**

**TypeScript:**
```typescript
// UI şablonu - Local Persistent + TTL (otomatik)
dataManager.setData(DataContext.artifact, "views/loan-application-form", {
  schema: { /* JSON Schema */ },
  uiSchema: { /* UI Schema */ },
  version: "1.2.0"
}, { ttl: 60 * 60 * 1000 }); // 1 saat TTL

// Navigation config - TTL ile expire olur, backend'den yenisi çekilir
dataManager.setData(DataContext.artifact, "navigation/main-menu", {
  items: [
    { id: "home", label: "Ana Sayfa", icon: "home" },
    { id: "accounts", label: "Hesaplarım", icon: "wallet" }
  ]
}, { ttl: 24 * 60 * 60 * 1000 }); // 24 saat TTL

// Artifact okuma
const formView = dataManager.getData(DataContext.artifact, "views/loan-application-form");
```

**Flutter (Dart):**
```dart
// UI şablonu - Local Persistent + TTL (otomatik)
dataManager.setData(DataContext.artifact, "views/loan-application-form", {
  "schema": { /* JSON Schema */ },
  "uiSchema": { /* UI Schema */ },
  "version": "1.2.0"
}, ttl: Duration(hours: 1)); // 1 saat TTL

// Navigation config - TTL ile expire olur, backend'den yenisi çekilir
dataManager.setData(DataContext.artifact, "navigation/main-menu", {
  "items": [
    {"id": "home", "label": "Ana Sayfa", "icon": "home"},
    {"id": "accounts", "label": "Hesaplarım", "icon": "wallet"}
  ]
}, ttl: Duration(hours: 24)); // 24 saat TTL

// Artifact okuma
final formView = dataManager.getData(DataContext.artifact, "views/loan-application-form");
```

### **Event Delegation Senaryoları**

**TypeScript:**
```typescript
// Basic listener - Data değişikliklerini dinleme
dataManager.addListener(
  "themeListener",
  DataContext.user,
  "preferences",
  (preferences) => {
    console.log("User preferences changed:", preferences);
  },
  { dataPath: "theme" }
);

// Scope listener - Müşteri değişikliğini dinleme
dataManager.addListener(
  "customerListener",
  DataContext.scope,
  "customer/$ActiveScope/profile",
  (profile) => {
    console.log("Customer profile updated:", profile);
  }
);

// Listener cleanup
dataManager.removeListener("themeListener");
dataManager.clearAllListeners();
```

**Flutter (Dart):**
```dart
// Basic listener - Data değişikliklerini dinleme
dataManager.addListener(
  "themeListener",
  DataContext.user,
  "preferences",
  (preferences) {
    print("User preferences changed: $preferences");
  },
  dataPath: "theme"
);

// Scope listener - Müşteri değişikliğini dinleme
dataManager.addListener(
  "customerListener",
  DataContext.scope,
  "customer/$ActiveScope/profile",
  (profile) {
    print("Customer profile updated: $profile");
  }
);

// Listener cleanup
dataManager.removeListener("themeListener");
dataManager.clearAllListeners();
```

### **Data Binding Senaryoları**

**TypeScript (Vue/React):**
```typescript
// 1. SINGLE FIELD BINDING - Traditional approach
// Workflow instance data binding (readonly display)
dataManager.bindData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  firstNameInputComponent,
  BindingMode.readOnly,
  { dataPath: "applicant.firstName" }
);

// 2. COMPOSITE FIELD BINDING - DataManager methods (ONE-WAY/READONLY)
// Full name display: firstName + lastName
const fullNameLabel = ref(""); // Vue ref veya React state
dataManager.bindCompositeData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  ["applicant.firstName", "applicant.lastName"],
  (values) => {
    const firstName = values[0] ?? "";
    const lastName = values[1] ?? "";
    return `${firstName} ${lastName}`.trim();
  },
  fullNameLabel
);

// 3. MULTI-CONTEXT COMPOSITE BINDING - Cross-context data combination
const greetingLabel = ref("");
dataManager.bindMultiContextData(
  [
    [DataContext.workflowInstance, "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3", "applicant.firstName"],
    [DataContext.user, "preferences", "language"],
    [DataContext.scope, "customer/$ActiveScope/profile", "firstName"],
  ],
  (values) => {
    const applicantName = values[0] ?? "Guest";
    const language = values[1] ?? "en";
    const customerName = values[2] ?? "";
    return language === "tr" 
      ? `Sayın ${customerName}, başvuran: ${applicantName}` 
      : `Dear ${customerName}, applicant: ${applicantName}`;
  },
  greetingLabel
);

// 4. TRADITIONAL SINGLE BINDINGS - Still supported
// Workflow form input binding (editable)
dataManager.bindData(
  DataContext.workflowTransition,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  termInputComponent,
  BindingMode.twoWay,
  { dataPath: "term" }
);
```

**Flutter (Dart):**
```dart
// 1. SINGLE FIELD BINDING - Traditional approach
// Workflow instance data binding (readonly display)
dataManager.bindData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  firstNameInput,
  BindingMode.readOnly,
  dataPath: "applicant.firstName"
);

// 2. COMPOSITE FIELD BINDING - DataManager methods (ONE-WAY/READONLY)
// Normal bindData() ile aynı mantık - widget parametre olarak veriliyor

// Full name display: firstName + lastName
final fullNameLabel = Text("", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold));
dataManager.bindCompositeData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  ["applicant.firstName", "applicant.lastName"],
  (values) {
    final firstName = values[0] ?? "";
    final lastName = values[1] ?? "";
    return "$firstName $lastName".trim();
  },
  fullNameLabel // Widget parametre olarak veriliyor
);

// Address display: street + city + country
final addressLabel = Text("");
dataManager.bindCompositeData(
  DataContext.workflowInstance,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  ["applicant.address.street", "applicant.address.city", "applicant.address.country"],
  (values) {
    final parts = values.where((v) => v != null && v.toString().isNotEmpty).toList();
    return parts.join(", ");
  },
  addressLabel // Widget parametre olarak veriliyor
);





// 3. MULTI-CONTEXT COMPOSITE BINDING - Cross-context data combination
final greetingLabel = Text("");
dataManager.bindMultiContextData(
  [
    (DataContext.workflowInstance, "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3", "applicant.firstName"),
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
  greetingLabel
);

// 4. TRADITIONAL SINGLE BINDINGS - Still supported
// Workflow form input binding (editable)
dataManager.bindData(
  DataContext.workflowTransition,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  termInput,
  BindingMode.twoWay,
  dataPath: "term"
);

// User preferences binding - Secure Persistent (otomatik)
dataManager.bindData(
  DataContext.user,
  "preferences",
  themeSelector,
  BindingMode.twoWay,
  dataPath: "theme"
);

// Device settings binding - Local Persistent (otomatik)
dataManager.bindData(
  DataContext.device,
  "settings",
  languageSelector,
  BindingMode.twoWay,
  dataPath: "language"
);

// Scope customer data binding - Secure Persistent (otomatik)
dataManager.bindData(
  DataContext.scope,
  "customer/$ActiveScope/profile",
  customerCard,
  BindingMode.oneWay,
  dataPath: "firstName"
);

// Artifact view binding - In-Memory + Cache (otomatik)
dataManager.bindData(
  DataContext.artifact,
  "views/loan-form",
  formRenderer,
  BindingMode.oneWay
);
```

### **Batch Operations Senaryoları**

**TypeScript:**
```typescript
// Batch data setting - Form submit senaryosu
dataManager.batchSet([
  { context: DataContext.user, key: "profile/name", value: "John" },
  { context: DataContext.user, key: "profile/email", value: "john@example.com" },
  { context: DataContext.user, key: "profile/age", value: 30 },
  { context: DataContext.scope, key: "customer/$ActiveScope/lastContact", value: new Date() }
]);

// Batch data getting - Profile load senaryosu
const results = dataManager.batchGet([
  { context: DataContext.user, key: "profile/name" },
  { context: DataContext.user, key: "profile/email" },
  { context: DataContext.device, key: "info/deviceId" }
]);
// Returns: Array of { context, key, value }

// Extract values easily
const name = results[0].value;
const email = results[1].value;
const deviceId = results[2].value;

// Batch form binding - Loan application form
dataManager.batchBind(
  DataContext.workflowTransition,
  "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3/application-form",
  BindingMode.twoWay,
  [
    { dataPath: "applicant.firstName", component: firstNameInput },
    { dataPath: "applicant.lastName", component: lastNameInput },
    { dataPath: "applicant.email", component: emailInput },
    { dataPath: "applicant.phone", component: phoneInput },
    { dataPath: "loan.amount", component: amountInput },
    { dataPath: "loan.term", component: termInput },
    { dataPath: "loan.purpose", component: purposeDropdown },
    { dataPath: "documents.idCard", component: idCardUpload },
    { dataPath: "documents.salarySlip", component: salarySlipUpload },
    { dataPath: "agreement.terms", component: termsCheckbox }
  ]
);
```

**Flutter (Dart):**
```dart
// Batch data setting - Form submit senaryosu
dataManager.batchSet([
  (DataContext.user, "profile/name", "John"),
  (DataContext.user, "profile/email", "john@example.com"),
  (DataContext.user, "profile/age", 30),
  (DataContext.scope, "customer/$ActiveScope/lastContact", DateTime.now())
]);

// Batch data getting - Profile load senaryosu
final results = dataManager.batchGet([
  (DataContext.user, "profile/name"),
  (DataContext.user, "profile/email"),
  (DataContext.device, "info/deviceId")
]);
// Returns: [(DataContext.user, "profile/name", "John"), (...), (...)]

// Extract values easily
final name = results[0].$3; // Tuple'dan value'yu al
final email = results[1].$3;
final deviceId = results[2].$3;

// Batch form binding - Loan application form
dataManager.batchBind(
  DataContext.workflowTransition,
  "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3/application-form",
  BindingMode.twoWay,
  [
    ("applicant.firstName", firstNameInput),
    ("applicant.lastName", lastNameInput),
    ("applicant.email", emailInput),
    ("applicant.phone", phoneInput),
    ("loan.amount", amountInput),
    ("loan.term", termInput),
    ("loan.purpose", purposeDropdown),
    ("documents.idCard", idCardUpload),
    ("documents.salarySlip", salarySlipUpload),
    ("agreement.terms", termsCheckbox)
  ]
);
```

### **Data Migration Senaryoları**

**TypeScript:**
```typescript
// Version upgrade migration with export/import
// 1. Export old data (context bazlı - storage otomatik belirlenir)
const userBackup = dataManager.exportData(DataContext.user);
const deviceBackup = dataManager.exportData(DataContext.device);

// 2. Application layer transforms data (business logic responsibility)
const transformedUserData = MigrationService.transformUserData(userBackup, "1.0", "2.0");
const transformedDeviceData = MigrationService.transformDeviceData(deviceBackup, "1.0", "2.0");

// 3. Import transformed data
dataManager.importData(DataContext.user, transformedUserData);
dataManager.importData(DataContext.device, transformedDeviceData);

// Selective export/import - Specific data migration
const onlyPreferences = dataManager.exportData(DataContext.user, { partialKey: "preferences" });
const workflowBackup = dataManager.exportData(DataContext.workflowInstance, { partialKey: "loan-app/" });

// Restore if migration fails
dataManager.importData(DataContext.user, userBackup, { overwrite: false });
```

**Flutter (Dart):**
```dart
// Version upgrade migration with export/import
// 1. Export old data (context bazlı - storage otomatik belirlenir)
final userBackup = dataManager.exportData(DataContext.user);
final deviceBackup = dataManager.exportData(DataContext.device);

// 2. Application layer transforms data (business logic responsibility)
final transformedUserData = MigrationService.transformUserData(userBackup, "1.0", "2.0");
final transformedDeviceData = MigrationService.transformDeviceData(deviceBackup, "1.0", "2.0");

// 3. Import transformed data
dataManager.importData(DataContext.user, transformedUserData);
dataManager.importData(DataContext.device, transformedDeviceData);

// Selective export/import - Specific data migration
final onlyPreferences = dataManager.exportData(DataContext.user, partialKey: "preferences");
final workflowBackup = dataManager.exportData(DataContext.workflowInstance, partialKey: "loan-app/");

// Restore if migration fails
dataManager.importData(DataContext.user, userBackup, overwrite: false);
```



## 🔧 **DataManager Public Interface**

### **TypeScript Interface**

```typescript
/**
 * DataContext - Veri bağlamını ve storage türünü belirler
 * 
 * Storage ve Encryption:
 * - device: Local Persistent (şifrelenmez - bootstrap için gerekli)
 * - user: Local Persistent + Encrypted (tek key ile)
 * - scope: Local Persistent + Encrypted (tek key ile)
 * - workflowInstance: In-Memory (şifrelenmez, geçici)
 * - workflowTransition: In-Memory (şifrelenmez, geçici)
 * - artifact: Local Persistent (şifrelenmez, hassas değil, TTL ile)
 * - secureMemory: In-Memory ONLY (asla persist edilmez, encryption key için)
 * 
 * ⚠️ Encryption key Device Register'dan alınır ve secureMemory'de tutulur
 * ⚠️ device context şifrelenmez (deviceId/installationId bootstrap için gerekli)
 */
enum DataContext {
  device,             // Cihaz verileri - Local Persistent (NO encryption - bootstrap)
  user,               // Kullanıcı verileri - Local Persistent + Encrypted
  scope,              // İşlem yapılan müşteri/kapsam - Local Persistent + Encrypted
  workflowInstance,   // İş akışı instance - In-Memory
  workflowTransition, // Form/transition verisi - In-Memory
  artifact,           // Render içerikleri, JSON - Local Persistent (no encryption)
  secureMemory        // Hassas runtime verileri (encryption key) - In-Memory ONLY
}

enum BindingMode {
  oneWay,    // Read-only binding
  twoWay,    // Read-write binding
  readOnly   // Read-only binding (alias for oneWay)
}

interface DataManager {
  // ===== ACTIVE CONTEXT MANAGEMENT =====
  
  // Dinamik değişkenler için aktif kullanıcı ve scope ayarları
  // Key'lerde $ActiveUser ve $ActiveScope değişkenleri bu değerlerle replace edilir
  setActiveUser(userId: string): void;
  getActiveUser(): string | undefined;
  setActiveScope(scopeId: string): void;
  getActiveScope(): string | undefined;
  
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
/// DataContext - Veri bağlamını ve storage türünü belirler
/// 
/// Storage ve Encryption:
/// - device: Local Persistent (şifrelenmez - bootstrap için gerekli)
/// - user: Local Persistent + Encrypted (tek key ile)
/// - scope: Local Persistent + Encrypted (tek key ile)
/// - workflowInstance: In-Memory (şifrelenmez, geçici)
/// - workflowTransition: In-Memory (şifrelenmez, geçici)
/// - artifact: Local Persistent (şifrelenmez, hassas değil, TTL ile)
/// - secureMemory: In-Memory ONLY (asla persist edilmez, encryption key için)
/// 
/// ⚠️ Encryption key Device Register'dan alınır ve secureMemory'de tutulur
/// ⚠️ device context şifrelenmez (deviceId/installationId bootstrap için gerekli)
enum DataContext {
  device,             // Cihaz verileri - Local Persistent (NO encryption - bootstrap)
  user,               // Kullanıcı verileri - Local Persistent + Encrypted
  scope,              // İşlem yapılan müşteri/kapsam - Local Persistent + Encrypted
  workflowInstance,   // İş akışı instance - In-Memory
  workflowTransition, // Form/transition verisi - In-Memory
  artifact,           // Render içerikleri, JSON - Local Persistent (no encryption)
  secureMemory        // Hassas runtime verileri (encryption key) - In-Memory ONLY
}

enum BindingMode {
  oneWay,    // Read-only binding
  twoWay,    // Read-write binding
  readOnly   // Read-only binding (alias for oneWay)
}

class DataManager {
  // ===== ACTIVE CONTEXT MANAGEMENT =====
  
  // Dinamik değişkenler için aktif kullanıcı ve scope ayarları
  // Key'lerde $ActiveUser ve $ActiveScope değişkenleri bu değerlerle replace edilir
  void setActiveUser(String userId);
  String? getActiveUser();
  void setActiveScope(String scopeId);
  String? getActiveScope();
  
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
