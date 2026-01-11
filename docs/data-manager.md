# Data Manager

Uygulamanın **merkezi state store**'unu sağlayan core SDK sınıfıdır. Hem TypeScript (web) hem de Flutter (mobil) platformlarında aynı interface ve davranışı sağlar.

## 🏪 State Store Rolü

DataManager, uygulamanın **tüm verilerinin merkezi deposudur**. Geleneksel state management çözümlerinden farklı olarak:

* **Unified Storage**: InMemory, Persistent, Workflow verilerini tek bir interface altında yönetir
* **Context-Aware**: Device-level ve User-level veri ayrımı yapar
* **Observable**: Tüm veri değişiklikleri reactive olarak broadcast edilir
* **Cross-Component**: Farklı UI component'ları (Vue/React component'ları veya Flutter widget'ları), manager'lar ve service'ler arasında veri paylaşımı sağlar
* **Lifecycle Management**: TTL, caching, persistence otomatik yönetilir

> **💡 Önemli Not**: DataManager, Redux/MobX/Provider gibi state management kütüphanelerinin yerini alır. Uygulamanın tek veri kaynağıdır (Single Source of Truth).

## 🎯 Temel Amaç

Uygulamanın tüm state'ini observable bir şekilde yönetmek, veri değişikliklerini UI component'lara, manager'lara ve service'lere otomatik olarak broadcast etmektir.

## 🚀 Temel Sunduğu Hizmetler

* **State Storage**: Uygulamanın tüm state'ini merkezi olarak depolar (UI state, business data, cache, user preferences)
* **Reactive State Management**: State değişikliklerini otomatik olarak tüm subscriber'lara broadcast eder
* **Multi-Scope Storage**: InMemory, Persistent, Workflow scope'larını unified interface ile yönetir
* **Context-Based Isolation**: Device-level ve User-level state'leri güvenli şekilde ayırır
* **Dynamic Data Structure**: JSON benzeri hiyerarşik veri yapılarını destekler (Map, List, primitives)
* **Data Binding**: UI component'larını (Vue/React component'ları veya Flutter widget'ları) state'e one-way/two-way binding ile bağlar
* **Cross-Component Communication**: Manager'lar, Service'ler ve Widget'lar arası state paylaşımı
* **TTL & Persistence**: State lifecycle'ını otomatik yönetir (cache, expire, persist)

## 📍 State Access Patterns

DataManager'daki state'lere erişim çok boyutlu bir adreslenme sistemi kullanır:

* **Scope-based**: State kategorileri DataScope enum ile belirlenir (inMemory, persistent, workflowInstance, workflowTransition)
* **Context-based**: State ownership DataContext enum ile belirlenir (device: global state, user: user-specific state - encrypted storage ile korunur, detay: `secureStorage.md`)
* **Key-based**: Her scope+context içinde unique string key ile state adreslenebilir
* **Path-based**: Slash notation ile hiyerarşik state yapısı (örn: "loan-app/instance-id/transition-name")
* **DataPath-based**: Kompleks state object'lerin içindeki spesifik property'lere erişim (örn: "applicant.firstName")

**State Adresleme Örneği:**

**TypeScript:**
```typescript
// Scope: inMemory, Context: user, Key: user/preferences, DataPath: theme
dataManager.getData(DataScope.inMemory, DataContext.user, "user/preferences", { dataPath: "theme" });
```

**Flutter (Dart):**
```dart
// Scope: inMemory, Context: user, Key: user/preferences, DataPath: theme
dataManager.getData(DataScope.inMemory, DataContext.user, "user/preferences", dataPath: "theme");
```




## 💡 Kullanım Senaryoları

### **Workflow Veri Yönetimi Senaryosu**

Burada belirlenen lifecycle sadece veri yönetimi için adımları içerir. İş akışı için yapılacak diğer işlemler ve kararlar WorkflowManager tarafından yönetilir.

1. **Instance Data Loading**: İş akışının instance verisi backend'den çekilir ve kaydedilir. `setData(DataScope.workflowInstance, DataContext.user, key, data)`
2. **Form Schema Preparation**: İş akışının geçişi için gerekli form bilgileri transition'a bağlı JSONSchema'dan çekilir.
3. **Default Form Data Creation**: JSONSchema'dan varsayılan değerlerle boş form verisi oluşturulur ve transition data'sı olarak kaydedilir. `setData(DataScope.workflowTransition, DataContext.user, key, data)`
4. **Form Data Binding**: Form widget'ları transition data'sına two-way binding ile bağlanır. `bindData(DataScope.workflowTransition, DataContext.user, key, widget, BindingMode.twoWay)`
5. **Form Submission**: Form submit edildiğinde `getData(DataScope.workflowTransition, DataContext.user, key)` ile veri çekilir ve backend servise submit edilir.
6. **Instance Data Update**: Başarılı submit sonrasında yeniden instance data'sı çekilir ve eski veri üzerine observability korunarak overwrite edilir. `setData(DataScope.workflowInstance, DataContext.user, key, data)`


**TypeScript:**
```typescript
// İş akışı instance data'sı backend'den okunup kaydediliyor.
// Data type: any (Record, Array, string, number, boolean her şey olabilir)
dataManager.setData(
  DataScope.workflowInstance,
  DataContext.user,
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
// Data type: any - Flexible data structure
dataManager.setData(
  DataScope.workflowTransition,
  DataContext.user,
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
// Data type: dynamic (Map, List, String, int, bool her şey olabilir)
dataManager.setData(
  DataScope.workflowInstance,
  DataContext.user,
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
// Data type: dynamic - Flexible data structure
dataManager.setData(
  DataScope.workflowTransition,
  DataContext.user,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  {
    "term": 36,
    "paymentPlan": "equalInstallments"
  }
);
```

### **InMemory Veri Yönetimi Senaryosu**

**TypeScript:**
```typescript
// InMemory user preferences - User-specific
dataManager.setData(DataScope.inMemory, DataContext.user, "user/preferences", { theme: "dark", language: "tr" });

// InMemory app data - Device-wide
dataManager.setData(DataScope.inMemory, DataContext.device, "app/version", "1.2.3");
dataManager.setData(DataScope.inMemory, DataContext.user, "user/isLoggedIn", true);
dataManager.setData(DataScope.inMemory, DataContext.user, "session/timeout", 3600);

// Vue/React component'ları bindData() ile otomatik reactive olur
dataManager.bindData(DataScope.inMemory, DataContext.user, "user/preferences", themeComponent, BindingMode.oneWay, { dataPath: "theme" });

// API data with TTL - Array or Record (inMemory with TTL = cache behavior)
dataManager.setData(DataScope.inMemory, DataContext.device, "api/cities", ["Istanbul", "Ankara", "Izmir"], { ttl: 24 * 60 * 60 * 1000 }); // 24 hours in milliseconds
dataManager.setData(DataScope.inMemory, DataContext.user, "api/user-profile", { name: "John", age: 30 }, { ttl: 15 * 60 * 1000 }); // 15 minutes
dataManager.bindData(DataScope.inMemory, DataContext.device, "api/cities", cityDropdown, BindingMode.oneWay);
```

**Flutter (Dart):**
```dart
// InMemory user preferences - User-specific
dataManager.setData(DataScope.inMemory, DataContext.user, "user/preferences", {"theme": "dark", "language": "tr"});

// InMemory app data - Device-wide
dataManager.setData(DataScope.inMemory, DataContext.device, "app/version", "1.2.3");
dataManager.setData(DataScope.inMemory, DataContext.user, "user/isLoggedIn", true);
dataManager.setData(DataScope.inMemory, DataContext.user, "session/timeout", 3600);

// Widget'lar bindData() ile otomatik reactive olur
dataManager.bindData(DataScope.inMemory, DataContext.user, "user/preferences", themeWidget, BindingMode.oneWay, dataPath: "theme");

// API data with TTL - List or Map (inMemory with TTL = cache behavior)
dataManager.setData(DataScope.inMemory, DataContext.device, "api/cities", ["Istanbul", "Ankara", "Izmir"], ttl: Duration(hours: 24));
dataManager.setData(DataScope.inMemory, DataContext.user, "api/user-profile", {"name": "John", "age": 30}, ttl: Duration(minutes: 15));
dataManager.bindData(DataScope.inMemory, DataContext.device, "api/cities", cityDropdown, BindingMode.oneWay);
```

### **Persistent Veri Senaryosu**

**TypeScript:**
```typescript
// Device-level local persistent data - Complex object (non-sensitive)
dataManager.setData(DataScope.persistentOnLocal, DataContext.device, "app/settings", {
  language: "tr", 
  theme: "dark", 
  notifications: true
});
const appSettings = dataManager.getData(DataScope.persistentOnLocal, DataContext.device, "app/settings"); // Returns any

// Device-level primitive data (non-sensitive)
dataManager.setData(DataScope.persistentOnLocal, DataContext.device, "app/firstRun", false);
dataManager.setData(DataScope.persistentOnLocal, DataContext.device, "app/launchCount", 42);

// User-level encrypted persistent data - Array and Record mix (sensitive data)
// ⚠️ GÜVENLIK: persistentOnSecure + DataContext.user encrypted storage kullanır (secureStorage.md referansı)
dataManager.setData(DataScope.persistentOnSecure, DataContext.user, "user/favorites", ["item1", "item2", "item3"]);
dataManager.setData(DataScope.persistentOnSecure, DataContext.user, "user/profile", { name: "John", email: "john@example.com" });
dataManager.bindData(DataScope.persistentOnSecure, DataContext.user, "user/favorites", favoritesComponent, BindingMode.twoWay);
```

**Flutter (Dart):**
```dart
// Device-level local persistent data - Complex object (non-sensitive)
dataManager.setData(DataScope.persistentOnLocal, DataContext.device, "app/settings", {
  "language": "tr", 
  "theme": "dark", 
  "notifications": true
});
final appSettings = dataManager.getData(DataScope.persistentOnLocal, DataContext.device, "app/settings"); // Returns dynamic

// Device-level primitive data (non-sensitive)
dataManager.setData(DataScope.persistentOnLocal, DataContext.device, "app/firstRun", false);
dataManager.setData(DataScope.persistentOnLocal, DataContext.device, "app/launchCount", 42);

// User-level encrypted persistent data - List and Map mix (sensitive data)
// ⚠️ GÜVENLIK: persistentOnSecure + DataContext.user encrypted storage kullanır (secureStorage.md referansı)
dataManager.setData(DataScope.persistentOnSecure, DataContext.user, "user/favorites", ["item1", "item2", "item3"]);
dataManager.setData(DataScope.persistentOnSecure, DataContext.user, "user/profile", {"name": "John", "email": "john@example.com"});
dataManager.bindData(DataScope.persistentOnSecure, DataContext.user, "user/favorites", favoritesWidget, BindingMode.twoWay);
```

### **Event Delegation Senaryoları**

**TypeScript:**
```typescript
// Basic listener - Data değişikliklerini dinleme
dataManager.addListener(
  "themeListener",
  DataScope.inMemory,
  DataContext.user,
  "user/preferences",
  (preferences) => {
    console.log("User preferences changed:", preferences);
  },
  { dataPath: "theme" }
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
  DataScope.inMemory,
  DataContext.user,
  "user/preferences",
  (preferences) {
    print("User preferences changed: $preferences");
  },
  dataPath: "theme"
);

// Listener cleanup
dataManager.removeListener("themeListener");
dataManager.clearAllListeners();
```

### **Data Binding Senaryoları**

**TypeScript (Vue/React):**
```typescript
// 1. SINGLE FIELD BINDING - Traditional approach
// Workflow instance data binding (readonly display) - User-specific
dataManager.bindData(
  DataScope.workflowInstance,
  DataContext.user,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  firstNameInputComponent,
  BindingMode.readOnly,
  { dataPath: "applicant.firstName" }
);

// 2. COMPOSITE FIELD BINDING - DataManager methods (ONE-WAY/READONLY)
// Full name display: firstName + lastName
const fullNameLabel = ref(""); // Vue ref veya React state
dataManager.bindCompositeData(
  DataScope.workflowInstance,
  DataContext.user,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  ["applicant.firstName", "applicant.lastName"],
  (values) => {
    const firstName = values[0] ?? "";
    const lastName = values[1] ?? "";
    return `${firstName} ${lastName}`.trim();
  },
  fullNameLabel
);

// 3. MULTI-SCOPE COMPOSITE BINDING - Cross-scope data combination
const greetingLabel = ref("");
dataManager.bindMultiScopeData(
  [
    [DataScope.workflowInstance, DataContext.user, "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3", "applicant.firstName"],
    [DataScope.inMemory, DataContext.user, "user/preferences", "language"],
    [DataScope.workflowInstance, DataContext.user, "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3", "applicant.lastName"],
  ],
  (values) => {
    const firstName = values[0] ?? "Guest";
    const language = values[1] ?? "en";
    const lastName = values[2] ?? "";
    const fullName = `${firstName} ${lastName}`.trim();
    return language === "tr" ? `Sayın ${fullName}` : `Dear ${fullName}`;
  },
  greetingLabel
);

// 4. TRADITIONAL SINGLE BINDINGS - Still supported
// Workflow form input binding (editable) - User-specific
dataManager.bindData(
  DataScope.workflowTransition,
  DataContext.user,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  termInputComponent,
  BindingMode.twoWay,
  { dataPath: "term" }
);
```

**Flutter (Dart):**
```dart
// 1. SINGLE FIELD BINDING - Traditional approach
// Workflow instance data binding (readonly display) - User-specific
dataManager.bindData(
  DataScope.workflowInstance,
  DataContext.user,
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
  DataScope.workflowInstance,
  DataContext.user,
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
  DataScope.workflowInstance,
  DataContext.user,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
  ["applicant.address.street", "applicant.address.city", "applicant.address.country"],
  (values) {
    final parts = values.where((v) => v != null && v.toString().isNotEmpty).toList();
    return parts.join(", ");
  },
  addressLabel // Widget parametre olarak veriliyor
);





// 3. MULTI-SCOPE COMPOSITE BINDING - Cross-scope data combination
final greetingLabel = Text("");
dataManager.bindMultiScopeData(
  [
    (DataScope.workflowInstance, DataContext.user, "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3", "applicant.firstName"),
    (DataScope.inMemory, DataContext.user, "user/preferences", "language"),
    (DataScope.workflowInstance, DataContext.user, "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3", "applicant.lastName"), // Same source, different path
  ],
  (values) {
    final firstName = values[0] ?? "Guest";   // From workflowInstance.applicant.firstName
    final language = values[1] ?? "en";       // From inMemory.user/preferences.language  
    final lastName = values[2] ?? "";         // From workflowInstance.applicant.lastName
    final fullName = "$firstName $lastName".trim();
    return language == "tr" ? "Sayın $fullName" : "Dear $fullName";
  },
  greetingLabel
);

// 4. TRADITIONAL SINGLE BINDINGS - Still supported
// Workflow form input binding (editable) - User-specific
dataManager.bindData(
  DataScope.workflowTransition,
  DataContext.user,
  "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
  termInput,
  BindingMode.twoWay,
  dataPath: "term"
);

// InMemory user data binding - User-specific
dataManager.bindData(
  DataScope.inMemory,
  DataContext.user,
  "user/preferences",
  themeSelector,
  BindingMode.twoWay,
  dataPath: "theme"
);

// InMemory shared data binding - Device-wide
dataManager.bindData(
  DataScope.inMemory,
  DataContext.device,
  "api/cities",
  cityDropdown,
  BindingMode.oneWay
);

// Local persistent device-level binding (non-sensitive)
dataManager.bindData(
  DataScope.persistentOnLocal,
  DataContext.device,
  "app/settings",
  languageSelector,
  BindingMode.twoWay,
  dataPath: "language"
);

// Encrypted persistent user-level binding (sensitive)
dataManager.bindData(
  DataScope.persistentOnSecure,
  DataContext.user,
  "user/favorites",
  favoritesList,
  BindingMode.twoWay,
  dataPath: "items"
);

// InMemory data binding with TTL - User-specific  
dataManager.bindData(
  DataScope.inMemory,
  DataContext.user,
  "search/results",
  searchResultsList,
  BindingMode.oneWay
);
```

### **Batch Operations Senaryoları**

**TypeScript:**
```typescript
// Batch data setting - Form submit senaryosu, farklı TTL'ler
dataManager.batchSet([
  { scope: DataScope.persistentOnSecure, context: DataContext.user, key: "user/name", value: "John", ttl: null }, // Encrypted permanent
  { scope: DataScope.persistentOnSecure, context: DataContext.user, key: "user/email", value: "john@example.com", ttl: null },
  { scope: DataScope.persistentOnSecure, context: DataContext.user, key: "user/age", value: 30, ttl: null },
  { scope: DataScope.inMemory, context: DataContext.user, key: "user/lastLogin", value: new Date(), ttl: 24 * 60 * 60 * 1000 } // 24h TTL
]);

// Batch data getting - Profile load senaryosu
const results = dataManager.batchGet([
  { scope: DataScope.persistentOnSecure, context: DataContext.user, key: "user/name" },
  { scope: DataScope.persistentOnSecure, context: DataContext.user, key: "user/email" },
  { scope: DataScope.inMemory, context: DataContext.user, key: "session/token" }
]);
// Returns: Array of { scope, context, key, value }

// Extract values easily
const name = results[0].value;
const email = results[1].value;
const token = results[2].value;

// Batch form binding - Loan application form
dataManager.batchBind(
  DataScope.workflowTransition,
  DataContext.user,
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
// Batch data setting - Form submit senaryosu, farklı TTL'ler
dataManager.batchSet([
  (DataScope.persistentOnSecure, DataContext.user, "user/name", "John", null), // Encrypted permanent
  (DataScope.persistentOnSecure, DataContext.user, "user/email", "john@example.com", null),
  (DataScope.persistentOnSecure, DataContext.user, "user/age", 30, null),
  (DataScope.inMemory, DataContext.user, "user/lastLogin", DateTime.now(), Duration(hours: 24)) // 24h TTL
]);

// Batch data getting - Profile load senaryosu
final results = dataManager.batchGet([
  (DataScope.persistentOnSecure, DataContext.user, "user/name"),
  (DataScope.persistentOnSecure, DataContext.user, "user/email"),
  (DataScope.inMemory, DataContext.user, "session/token")
]);
// Returns: [(DataScope.persistentOnSecure, DataContext.user, "user/name", "John"), (...), (...)]

// Extract values easily
final name = results[0].$4; // Tuple'dan value'yu al
final email = results[1].$4;
final token = results[2].$4;

// Batch form binding - Loan application form
dataManager.batchBind(
  DataScope.workflowTransition,
  DataContext.user,
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
// 1. Export old data
const secureUserBackup = dataManager.exportData(DataScope.persistentOnSecure, DataContext.user);
const localDeviceBackup = dataManager.exportData(DataScope.persistentOnLocal, DataContext.device);

// 2. Application layer transforms data (business logic responsibility)
const transformedSecureData = MigrationService.transformUserData(secureUserBackup, "1.0", "2.0");
const transformedLocalData = MigrationService.transformDeviceData(localDeviceBackup, "1.0", "2.0");

// 3. Import transformed data
dataManager.importData(DataScope.persistentOnSecure, DataContext.user, transformedSecureData);
dataManager.importData(DataScope.persistentOnLocal, DataContext.device, transformedLocalData);

// Selective export/import - Specific data migration
const onlyPreferences = dataManager.exportData(DataScope.persistentOnSecure, DataContext.user, { partialKey: "user/preferences" });
const workflowBackup = dataManager.exportData(DataScope.workflowInstance, DataContext.user, { partialKey: "loan-app/" });

// Restore if migration fails
dataManager.importData(DataScope.persistentOnSecure, DataContext.user, secureUserBackup, { overwrite: false });
```

**Flutter (Dart):**
```dart
// Version upgrade migration with export/import
// 1. Export old data
final secureUserBackup = dataManager.exportData(DataScope.persistentOnSecure, DataContext.user);
final localDeviceBackup = dataManager.exportData(DataScope.persistentOnLocal, DataContext.device);

// 2. Application layer transforms data (business logic responsibility)
final transformedSecureData = MigrationService.transformUserData(secureUserBackup, "1.0", "2.0");
final transformedLocalData = MigrationService.transformDeviceData(localDeviceBackup, "1.0", "2.0");

// 3. Import transformed data
dataManager.importData(DataScope.persistentOnSecure, DataContext.user, transformedSecureData);
dataManager.importData(DataScope.persistentOnLocal, DataContext.device, transformedLocalData);

// Selective export/import - Specific data migration
final onlyPreferences = dataManager.exportData(DataScope.persistentOnSecure, DataContext.user, partialKey: "user/preferences");
final workflowBackup = dataManager.exportData(DataScope.workflowInstance, DataContext.user, partialKey: "loan-app/");

// Restore if migration fails
dataManager.importData(DataScope.persistentOnSecure, DataContext.user, secureUserBackup, overwrite: false);
```



## 🔧 **DataManager Public Interface**

### **TypeScript Interface**

```typescript
enum DataScope {
  inMemory,                // In-memory data (was: global)
  persistent,
  workflowInstance,
  workflowTransition
}

enum DataContext {
  device,  // Device-wide data (all users)
  user,    // Current user-specific data
  scope    // Current scope-specific data
}

enum BindingMode {
  oneWay,    // Read-only binding
  twoWay,    // Read-write binding
  readOnly   // Read-only binding (alias for oneWay)
}

interface DataManager {
  // ===== UNIFIED DATA METHODS =====
  
  // Universal data operations for ALL scopes
  // Key examples:
  // - Simple: "theme", "settings", "user.preferences"
  // - Workflow instance: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3"
  // - Workflow transition: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3/apply"
  // 
  // ⚠️ GÜVENLIK NOTU: DataScope.persistentOnSecure + DataContext.user kombinasyonu
  // logged user verilerini içerir ve encrypted storage yaklaşımı kullanılır.
  // DataScope.persistentOnLocal + DataContext.device kombinasyonu plain storage kullanır.
  // Detaylar için secureStorage.md dökümanına bakınız.
  setData(scope: DataScope, context: DataContext, key: string, value: any, options?: { ttl?: number, dataPath?: string }): void;
  getData<T = any>(scope: DataScope, context: DataContext, key: string, options?: { dataPath?: string }): T | undefined;
  deleteData(scope: DataScope, context: DataContext, key: string, options?: { dataPath?: string }): void;
  
  // Batch operations for performance
  batchSet(operations: Array<{ scope: DataScope, context: DataContext, key: string, value: any, ttl?: number }>): void;
  batchGet(operations: Array<{ scope: DataScope, context: DataContext, key: string }>): Array<{ scope: DataScope, context: DataContext, key: string, value: any }>;
  
  // ===== BINDING METHODS =====
  
  // Universal binding for ALL scopes
  // Component: Vue component ref, React state setter, or any reactive object
  // DataPath examples for complex objects:
  // - "applicant.firstName" (bind to nested property)
  // - "items[0].name" (bind to array element property)
  // - "settings.theme.colors.primary" (bind to deep nested property)
  bindData(scope: DataScope, context: DataContext, key: string, component: any, mode: BindingMode, options?: { dataPath?: string }): void;
  
  // Composite binding - Multiple fields combined and bound to component
  // ⚠️ NOT: Composite binding her zaman ONE-WAY/READONLY'dir - birden fazla field combine edildiği için
  bindCompositeData(
    scope: DataScope,
    context: DataContext,
    key: string,
    dataPaths: string[],
    combiner: (values: any[]) => any,
    component: any
  ): void;
  
  // Multi-scope composite binding - Cross-scope data combination
  bindMultiScopeData(
    sourcePathPairs: Array<[DataScope, DataContext, string, string]>,
    combiner: (values: any[]) => any,
    component: any
  ): void;
  
  // Batch binding for forms
  batchBind(
    scope: DataScope,
    context: DataContext,
    key: string,
    mode: BindingMode,
    bindings: Array<{ dataPath: string, component: any }>
  ): void;
  
  // ===== EVENT DELEGATION METHODS =====
  
  // Observable/Stream-based event listening - Advanced scenarios için
  observeData(scope: DataScope, context: DataContext, key: string, options?: { dataPath?: string }): Observable<any>;
  observeDataWhere(scope: DataScope, context: DataContext, key: string, condition: (value: any) => boolean, options?: { dataPath?: string }): Observable<any>;
    
  // Business logic delegation - Built into DataManager
  addListener(listenerId: string, scope: DataScope, context: DataContext, key: string, callback: (value: any) => void, options?: { dataPath?: string }): void;
  removeListener(listenerId: string): void;
  clearAllListeners(): void;
  
  // ===== UTILITY METHODS =====
  
  // Search and discovery
  findKeys(scope: DataScope, context: DataContext, partialKey: string): string[];
  
  // TTL management  
  getExpirationTime(scope: DataScope, context: DataContext, key: string): Date | undefined;
  
  // Cleanup operations
  clearData(scope: DataScope, context: DataContext, options?: { partialKey?: string }): void;
  
  // ===== DATA MIGRATION METHODS =====
  
  // Export/Import for version upgrades
  exportData(scope: DataScope, context: DataContext, options?: { partialKey?: string }): Record<string, any>;
  importData(scope: DataScope, context: DataContext, data: Record<string, any>, options?: { overwrite?: boolean }): void;
}
```

### **Flutter (Dart) Interface**

```dart
class DataManager {
  // ===== UNIFIED DATA METHODS =====
  
  // Data scope categories
  enum DataScope { 
    inMemory,                // In-memory data (was: global)
    persistentOnSecure,      // Encrypted persistent storage (user-specific sensitive data)
    persistentOnLocal,       // Local persistent storage (device-level data)
    workflowInstance,
    workflowTransition
  }
  
  // Data context (device vs user level)
  enum DataContext { device, user }
  
  // Universal data operations for ALL scopes
  // Key examples:
  // - Simple: "theme", "settings", "user.preferences"
  // - Workflow instance: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3"
  // - Workflow transition: "loan-app/317749d0-cfff-428d-8a11-20c2d2eff9e3/apply"
  // 
  // ⚠️ GÜVENLIK NOTU: DataScope.persistentOnSecure + DataContext.user kombinasyonu
  // logged user verilerini içerir ve encrypted storage yaklaşımı kullanılır.
  // DataScope.persistentOnLocal + DataContext.device kombinasyonu plain storage kullanır.
  // Detaylar için secureStorage.md dökümanına bakınız.
  void setData(DataScope scope, DataContext context, String key, dynamic value, {Duration? ttl, String? dataPath});
  dynamic getData(DataScope scope, DataContext context, String key, {String? dataPath});
  void deleteData(DataScope scope, DataContext context, String key, {String? dataPath});
  
  // Batch operations for performance
  void batchSet(List<(DataScope scope, DataContext context, String key, dynamic value, Duration? ttl)> operations);
  List<(DataScope scope, DataContext context, String key, dynamic value)> batchGet(List<(DataScope scope, DataContext context, String key)> operations);
  
  // ===== BINDING METHODS =====
  
  // Universal binding for ALL scopes
  // Widget: Flutter widget (Text, TextField, etc.)
  // DataPath examples for complex objects:
  // - "applicant.firstName" (bind to nested property)
  // - "items[0].name" (bind to array element property)
  // - "settings.theme.colors.primary" (bind to deep nested property)
  void bindData(DataScope scope, DataContext context, String key, Widget widget, BindingMode mode, {String? dataPath});
  
  // Composite binding - Multiple fields combined and bound to widget
  // ⚠️ NOT: Composite binding her zaman ONE-WAY/READONLY'dir - birden fazla field combine edildiği için
  void bindCompositeData(
    DataScope scope, 
    DataContext context, 
    String key, 
    List<String> dataPaths, 
    String Function(List<dynamic> values) combiner,
    Widget widget
  );
  
  // Multi-scope composite binding - Cross-scope data combination
  void bindMultiScopeData(
    List<(DataScope scope, DataContext context, String key, String dataPath)> sourcePathPairs,
    dynamic Function(List<dynamic> values) combiner,
    Widget widget
  );
  
  // Batch binding for forms
  void batchBind(DataScope scope, DataContext context, String key, BindingMode mode, List<(String dataPath, Widget widget)> bindings);
  
  // ===== EVENT DELEGATION METHODS (BLOC PATTERN) =====
  
  // Stream-based event listening - Advanced scenarios için
  Stream<dynamic> observeData(DataScope scope, DataContext context, String key, {String? dataPath});
  Stream<dynamic> observeDataWhere(DataScope scope, DataContext context, String key, bool Function(dynamic value) condition, {String? dataPath});
    
  // Business logic delegation - Built into DataManager
  void addListener(String listenerId, DataScope scope, DataContext context, String key, void Function(dynamic value) callback, {String? dataPath});
  void removeListener(String listenerId);
  void clearAllListeners();
  
  // ===== UTILITY METHODS =====
  
  // Search and discovery
  List<String> findKeys(DataScope scope, DataContext context, String partialKey);
  
  // TTL management  
  DateTime? getExpirationTime(DataScope scope, DataContext context, String key);
  
  // Cleanup operations
  void clearData(DataScope scope, DataContext context, {String? partialKey});
  
  // ===== DATA MIGRATION METHODS =====
  
  // Export/Import for version upgrades
  Map<String, dynamic> exportData(DataScope scope, DataContext context, {String? partialKey});
  void importData(DataScope scope, DataContext context, Map<String, dynamic> data, {bool overwrite = false});
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
