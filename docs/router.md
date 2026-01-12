# Router

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

Router, sayfa geçişlerini ve navigasyon akışlarını yöneten core SDK sınıfıdır.

## 🎯 Temel Amaç

Uygulama içerisinde sayfa geçişlerini, navigasyon history'sini ve workspace yönetimini sağlamak. SDI (Single Document Interface) ve MDI (Multi Document Interface) modlarında esnek çalışabilir yapı sunmaktır.

**Lifecycle Entegrasyonu:**
- Router, cold start sırasında initialize edilir (lifecycle.md - step 350: Router.Init)
- Config'den `router.mode` (SDI/MDI) alınır ve router bu moda göre initialize edilir
- Step 400'de navigation'dan homepage key'i alınır ve router ile gösterilir
- Warm start'ta router zaten initialize edilmiş durumda, sadece state restore yapılır

## 🚀 Temel Sunduğu Hizmetler

* **Sayfa Navigasyonu**: Push/pop yaklaşımı ile sayfa geçişlerini yönetir
* **History Yönetimi**: Navigasyon geçmişini tutar ve geri gitme işlemlerini destekler  
* **Workspace Management**: SDI/MDI modlarına göre workspace alanını organize eder
* **Tab Management**: MDI modunda tab gruplarını ve lifecycle'ını yönetir

## 📍 Router Modes (SDI/MDI)

Router, client ayarlarından aldığı konfigürasyona göre iki farklı modda çalışabilir:

### SDI (Single Document Interface) Mode

SDI modunda router tek bir workspace container ile çalışır:

* **Single Placeholder**: Tek bir placeholder component ile initialize edilir
* **Stack Navigation**: Tüm sayfalar bu component içerisinde stack şeklinde açılır
* **History Management**: Sayfa geçişlerini history olarak yönetir ve pop/push yaklaşımını simüle eder
* **Workflow Integration**: İş akışlarının ilerleme ve geri gitme aksiyonları backend tarafından yönetilir
* **No Workflow History**: Akış sayfaları hareketleri navigation history'sine dahil edilmez


### Mode-Specific Implementation

Router internal olarak mode'a göre farklı davranır:

**SDI Mode Implementation:**
* Stack navigation ile sayfa push/pop
* Single container içinde sayfa değişimi
* History management ile geri gitme

**MDI Mode Implementation:**  
* Yeni tab creation ile sayfa açma
* Tab container içinde parallel sayfalar
* Tab lifecycle management

## 🎛️ Mode Selection

Router çalışma modunu şu öncelik sırasına göre belirler:

1. **Token Seviyesi Override**: Device ve 1FA token seviyelerinde router **her zaman SDI modunda** çalışır (override). MDI mode sadece 2FA+ token seviyelerinde anlamlıdır.
2. **User Preference**: Kullanıcı profil ayarlarından seçim (izin verilen client'larda, sadece 2FA+ için) - **Uygulama restart gerektirir**
3. **Client Configuration**: `client-function-config.json` içindeki `router.mode` ayarı (sadece 2FA+ token seviyeleri için geçerli)
4. **Platform Default**: Platform bazlı varsayılan (web: MDI, mobile: SDI) - sadece 2FA+ için

**Config Örneği:**
```json
{
  "router": {
    "mode": "mdi",
    "_comment": "Router mode: 'sdi' (Single Document Interface) or 'mdi' (Multi Document Interface). MDI mode özellikle kurumsal müşteriler ve backoffice çalışanları için kritiktir. User preference'dan değiştirilirse uygulama restart gerektirir. ÖNEMLİ: Device ve 1FA token seviyelerinde router her zaman SDI modunda çalışır (override). Bu mode ayarı sadece 2FA+ token seviyeleri için geçerlidir."
  }
}
```

**Token Seviyesine Göre Mode Davranışı:**

| Token Seviyesi | Router Mode | Açıklama |
|----------------|-------------|----------|
| **Device** | **SDI** (zorunlu) | Kayıt/giriş işlemleri, MDI gereksiz |
| **1FA** | **SDI** (zorunlu) | Sınırlı işlevler, MDI'nin faydası yok |
| **2FA+** | Config/User Preference | Tam yetkiler, MDI anlamlı |

**Neden Device/1FA'da SDI Zorunlu?**
- Device token seviyesinde sadece kayıt/giriş işlemleri var, MDI gereksiz
- 1FA token seviyesinde sınırlı işlevler var, MDI'nin faydası yok
- 2FA+ token seviyesinde tam yetkiler var, MDI kurumsal müşteriler için kritik
- Login sonrası (2FA) tab temizleme/karmaşıklığından kaçınırız

**Not:** Router mode cold start'da kritik olduğu için config'de belirtilmelidir. User preference'dan değiştirilirse uygulama restart gerektirir (makul bir davranış).

**Platform Farkları:**
- **Web (TypeScript)**: 
  - MDI mode: **Uygulama içi tab container** (kurumsal müşteriler ve backoffice çalışanları için kritik)
  - SDI mode: Single page application (SPA) navigation
- **Mobile (Flutter)**:
  - MDI mode: **Uygulama içi tab container** (tablet ve web'de anlamlı, mobilde daha az kullanılır)
  - SDI mode: Stack navigation (Navigator widget)

**Not:** MDI mode, özellikle kurumsal müşteriler ve backoffice çalışanları için önemlidir. Tüm "sayfayı aç" komutları router'a geldiği için kolayca implement edilebilir.

## 👥 Tüketiciler

Router aşağıdaki bileşenler tarafından kullanılır:

* **Navigation Components**: `neo_navigation_group` ve `neo_navigation` gibi görsel bileşenler
* **Workflow Manager**: İş akışı geçişlerini yöneten sistem

## 💡 Kullanım Senaryoları

### **Standart Sayfa Navigasyonu Senaryosu**

Kullanıcı navigation item'a tıkladığında unified navigation request oluşturulur:

```typescript
// TypeScript (Web)
// 1. User clicks navigation item (neo_navigation_group)
// 2. Navigation system processes backend response:
 {
    "type": "dynamicView",
    "version": "v2",
    "key": "profile-v2",
    "order": 500000,
    "title": "Profil Ayarları",
    "subtitle": "Gelişmiş profil yönetimi",
    "iconUrn": "urn:local:icons:profile_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": true,
      "isHot": false,
      "count": false
    },
    "config": {
      "key": "display-profile",
      "domain": "IDM",
      "version": "1.1",
      "flow": "view"
    },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "iban",
        "context": "device",
        "scope": "inMemory",
        "key": "account/TR3465346578900045",
        "path": "account.iban"
      },
      {
        "type": "dataManager",
        "promoteAs": "accountType",
        "context": "device",
        "scope": "inMemory",
        "key": "account/TR3465346578900045",
        "path": "account.type"
      }
    ]
  },

// 3. Unified navigation request (mode-agnostic)
// TypeScript
await router.navigate({
  type: NavigationType.dynamicView,
  version: NavigationVersion.v2,
  config: {
    key: "display-profile",
    domain: "IDM", 
    version: "1.1",
    flow: "view"
  },
  parameters: {
    iban: 'TR3465346578900045', 
    accountType: 'VDLMVD'
  }
});

// Dart
await router.navigate(
  type: NavigationType.dynamicView,
  version: NavigationVersion.v2,
  config: {
    "key": "display-profile",
    "domain": "IDM", 
    "version": "1.1",
    "flow": "view"
  },
  parameters: {
    'iban': 'TR3465346578900045', 
    'accountType': 'VDLMVD'
  }
);

// 4. Router handles based on current mode:
// SDI: Dynamic view in stack
// MDI: Dynamic view in new tab
```

### **Workflow Navigation Senaryosu**

Workflow navigation da mode-agnostic olarak işlenir:

```typescript
// TypeScript (Web)
// 1. User clicks workflow navigation item
{
  "type": "workflow",
  "version": "v2",
  "key": "money-transfer",
  "title": "Para Transferi",
  "config": {
    "key": "money-transfer-workflow",
    "domain": "transfer",
    "version": "1.1",
    "flow": "workflow"
  },
  "data": [
    {
      "type": "static",
      "promoteAs": "sourceAccount",
      "value": "TR123456789012345678901234"
    }
  ]
}

// 2. Unified workflow navigation request
// TypeScript
await router.navigate({
  type: NavigationType.workflow,
  version: NavigationVersion.v2,
  config: {
    key: "money-transfer-workflow",
    domain: "transfer",
    version: "1.1",
    flow: "workflow"
  },
  parameters: {
    sourceAccount: 'TR123456789012345678901234'
  }
});

// Dart
await router.navigate(
  type: NavigationType.workflow,
  version: NavigationVersion.v2,
  config: {
    "key": "money-transfer-workflow",
    "domain": "transfer",
    "version": "1.1",
    "flow": "workflow"
  },
  parameters: {
    'sourceAccount': 'TR123456789012345678901234'
  }
);

// 3. Router handles workflow based on mode:
// SDI: Workflow pages in same stack
// MDI: Workflow in dedicated tab
// WorkflowManager coordinates internally
```


### **Mode-Agnostic Navigation Senaryosu**

Tüm navigation request'ler aynı şekilde işlenir, mode farkı internal'da handle edilir:

```typescript
// TypeScript (Web)
// 1. Standard navigation request (mode doesn't matter)
{
  "type": "staticView",
  "version": "v1",
  "key": "dashboard-v1",
  "order": 900000,
  "title": "Dashboard",
  "subtitle": "Ana kontrol paneli",
  "iconUrn": "urn:local:icons:dashboard_20px:svg",
  "disabled": false,
  "disabledReason": null,
  "badge": {
    "isNew": false,
    "isHot": true,
    "count": false
  }, 
  "config": {
    "component": "dashboardWidget"
  },
  "data": [
    {
      "type": "dataManager",
      "promoteAs": "scope",
      "context": "user",
      "scope": "inMemory",
      "key": "user/profile",
      "path": "user.role"
    }
  ]
}

// 2. Unified navigation call
// TypeScript
await router.navigate({
  type: NavigationType.staticView,
  version: NavigationVersion.v1,
  config: {
    component: "dashboardWidget"
  },
  parameters: {
    scope: 'admin'
  }
});

// Dart
await router.navigate(
  type: NavigationType.staticView,
  version: NavigationVersion.v1,
  config: {
    "component": "dashboardWidget"
  },
  parameters: {
    'scope': 'admin'
  }
);

// 3. Router automatically handles based on current mode:
// SDI Mode: Dashboard in stack navigation
// MDI Mode: Dashboard in new tab

// Navigation caller doesn't know or care about SDI/MDI!
```

### **Home Page Management Senaryosu**

Uygulamanın farklı durumlarında home page'in dinamik olarak değiştirilmesi:

**Not:** Homepage artık navigation response'unda tanımlı (`homepage` key). Router, navigation'dan homepage key'ini alır ve ilgili navigation item'ını gösterir.

**Cache Yönetimi:**
- Navigation ve tüm backend'den gelen item'lar DataManager ile cache'lenir
- Her zaman sunucuya sorulur (ETag ile)
- Eğer sunucu değişiklik yok derse (HTTP 304 Not Modified), cache kullanılır
- Bu kural homepage özelinde değil, tüm backend'den gelen item'lar için geçerlidir

#### **1. Uygulama İlk Açılışında (Cold Start)**

```typescript
// TypeScript (Web)
async function initializeApp() {
  await router.initialize();
  
  // Navigation'dan homepage key'i alınır
  const navigation = await navigationManager.getNavigation();
  const homepageKey = navigation.homepage; // "authentication" (device token için)
  
  // Homepage navigation item'ını bul ve göster
  const homepageItem = navigation.items.find(item => item.key === homepageKey);
  await router.navigateToHomepage(homepageItem);
}
```

```dart
// Dart (Flutter)
Future<void> initializeApp() async {
  await router.initialize();
  
  // Navigation'dan homepage key'i alınır
  final navigation = await navigationManager.getNavigation();
  final homepageKey = navigation.homepage; // "authentication" (device token için)
  
  // Homepage navigation item'ını bul ve göster
  final homepageItem = navigation.items.firstWhere(
    (item) => item.key == homepageKey
  );
  await router.navigateToHomepage(homepageItem);
}
```

#### **2. Başarılı Login Sonrası**

```typescript
// TypeScript (Web)
async function onLoginSuccess(user: User) {
  // Navigation yeniden çekilir (token değişti, yeni navigation gelir)
  const navigation = await navigationManager.refreshNavigation();
  const homepageKey = navigation.homepage; // "account-list" (1FA/2FA token için)
  
  // Yeni homepage'e yönlendir
  const homepageItem = navigation.items.find(item => item.key === homepageKey);
  await router.navigateToHomepage(homepageItem);
  
  // Login sayfasını history'den temizle
  router.clearHistory();
}
```

```dart
// Dart (Flutter)
Future<void> onLoginSuccess(User user) async {
  // Navigation yeniden çekilir (token değişti, yeni navigation gelir)
  final navigation = await navigationManager.refreshNavigation();
  final homepageKey = navigation.homepage; // "account-list" (1FA/2FA token için)
  
  // Yeni homepage'e yönlendir
  final homepageItem = navigation.items.firstWhere(
    (item) => item.key == homepageKey
  );
  await router.navigateToHomepage(homepageItem);
  
  // Login sayfasını history'den temizle
  router.clearHistory();
}
```

#### **3. Logout İşlemi**

```typescript
// TypeScript (Web)
async function onLogout() {
  // Navigation yeniden çekilir (device token'a dönüldü)
  const navigation = await navigationManager.refreshNavigation();
  const homepageKey = navigation.homepage; // "authentication" (device token için)
  
  // Login sayfasına dön
  const homepageItem = navigation.items.find(item => item.key === homepageKey);
  await router.navigateToHomepage(homepageItem);
  
  // Tüm history'yi temizle
  router.clearHistory();
  
  // User session'ı temizle
  clearUserSession();
}
```

```dart
// Dart (Flutter)
Future<void> onLogout() async {
  // Navigation yeniden çekilir (device token'a dönüldü)
  final navigation = await navigationManager.refreshNavigation();
  final homepageKey = navigation.homepage; // "authentication" (device token için)
  
  // Login sayfasına dön
  final homepageItem = navigation.items.firstWhere(
    (item) => item.key == homepageKey
  );
  await router.navigateToHomepage(homepageItem);
  
  // Tüm history'yi temizle
  router.clearHistory();
  
  // User session'ı temizle
  clearUserSession();
}
```

#### **4. Home Button Handler**

```typescript
// TypeScript (Web)
async function onHomeButtonPressed() {
  // Navigation'dan mevcut homepage key'ini al
  const navigation = await navigationManager.getNavigation();
  const homepageKey = navigation.homepage;
  
  // Homepage'e git
  const homepageItem = navigation.items.find(item => item.key === homepageKey);
  await router.navigateToHomepage(homepageItem);
}
```

```dart
// Dart (Flutter)
Future<void> onHomeButtonPressed() async {
  // Navigation'dan mevcut homepage key'ini al
  final navigation = await navigationManager.getNavigation();
  final homepageKey = navigation.homepage;
  
  // Homepage'e git
  final homepageItem = navigation.items.firstWhere(
    (item) => item.key == homepageKey
  );
  await router.navigateToHomepage(homepageItem);
}
```


### **Tab Activation Senaryosu (MDI Mode)**

MDI modunda tab yönetimi router içinde yapılır. Bazı sayfalar single açılmalı - açıksa, aynı route emri geldiğinde yenisini açmamalı, var olanı açmalı.

**Tab Yönetimi Kuralları:**
- **Single Tab Policy**: Bazı sayfalar (ör. profil, ayarlar) tek seferde açılmalı - açıksa yenisini açmamalı, var olanı aktive etmeli
- **Homepage Pinned**: Ana sayfa MDI mode'da pinned olmalı ve kapatılamamalı
- **Tab Lifecycle**: Tab'lar router içinde yönetilir (close, pin, unpin, etc.)
- **Activation Strategy**: `activateIfExists: true` ile mevcut tab'ı aktive etme

MDI modunda aynı navigation varsa yeni tab açmak yerine mevcut tab'ı aktive etme:

```typescript
// TypeScript (Web)
// Kullanıcı Dashboard'a gitmek istiyor
await router.navigate({
  type: NavigationType.staticView,
  version: NavigationVersion.v1,
  config: { component: "dashboardWidget" },
  parameters: { scope: 'admin' },
  activateIfExists: true  // Mevcut dashboard tab'ı varsa onu aktive et
});

// Dart (Flutter)
await router.navigate(
  type: NavigationType.staticView,
  version: NavigationVersion.v1,
  config: {"component": "dashboardWidget"},
  parameters: {'scope': 'admin'},
  activateIfExists: true  // Mevcut dashboard tab'ı varsa onu aktive et
);

// Router internal logic:
// SDI Mode: activateIfExists ignored, normal navigation
// MDI Mode: 
//   - Dashboard tab exists? -> Switch to existing tab
//   - Dashboard tab doesn't exist? -> Create new tab
```


### **History Management Senaryosu**

Navigasyon geçmişi yönetimi:

**Web Browser History Entegrasyonu:**
- Web'de browser history ile entegrasyon yapılabilir (pushState/popState API)
- Ancak bu opsiyonel bir özellik olarak düşünülebilir
- Router'ın kendi internal history'si her zaman mevcuttur

**Mobil Back Button:**
- Mobil'de back button router'ın internal history'sini kullanır
- Android back button ve iOS swipe gesture router'ın `goBack()` method'unu tetikler

**Workflow History:**
- Workflow sayfaları navigation history'sine dahil edilmez ("No Workflow History" kuralı)
- Workflow içindeki sayfa geçişleri WorkflowManager tarafından yönetilir
- Workflow tamamlandığında veya iptal edildiğinde, workflow başlangıç noktasına dönülür
- **Örnek:** Kullanıcı para transferi workflow'unu başlatır → workflow içinde 3 sayfa geçer → workflow tamamlanır → router history'sinde sadece "para transferi başlatma" kaydı var, workflow içindeki 3 sayfa yok

```typescript
// TypeScript (Web)
// History stack kontrolü - internal navigation keys
const history: string[] = router.getNavigationHistory();
// Returns: ['home', 'dashboard-v1', 'profile-v2']

// History temizleme (logout sonrası)
router.clearHistory();

// Mevcut navigation key'i al
const currentKey: string | null = router.getCurrentRoute();
// Returns: 'profile-v2' (current navigation item key)
```

```dart
// Dart (Flutter)
// History stack kontrolü - internal navigation keys
List<String> history = router.getNavigationHistory();
// Returns: ['home', 'dashboard-v1', 'profile-v2']

// History temizleme (logout sonrası)
router.clearHistory();

// Mevcut navigation key'i al
String? currentKey = router.getCurrentRoute();
// Returns: 'profile-v2' (current navigation item key)
```

## 📚 Public Interface

Router sınıfının public method'ları ve kullanım arayüzü:

```typescript
// TypeScript (Web)
interface IRouter {
  // ===== CORE NAVIGATION METHOD =====
  
  // Main navigation method - takes navigation item from backend
  navigate(options: {
    type: NavigationType;              // NavigationType enum
    version?: NavigationVersion;        // NavigationVersion enum (defaults to v1)
    config: any;                       // View/workflow configuration (complex JSON, varies by type)
    parameters?: Record<string, any>;   // Key-value parameters to pass to the view
    activateIfExists?: boolean;         // MDI: activate existing tab instead of creating new one
  }): Promise<void>;
  
  // ===== BACK NAVIGATION =====
  
  goBack(): void;  // Back button implementation - goes to previous page
  
  // ===== ROUTER LIFECYCLE =====
  
  initialize(): Promise<void>;
  
  // ===== MODE MANAGEMENT =====
  
  getCurrentMode(): RouterMode;
  setMode(mode: RouterMode): Promise<void>;  // Runtime mode switching
  
  // ===== HOME PAGE MANAGEMENT =====
  
  navigateToHomepage(navigationItem: NavigationItem): Promise<void>;  // Navigate to homepage from navigation (navigation'dan homepage key'i alınır)
  
  // ===== HISTORY QUERIES =====
  
  getNavigationHistory(): string[];  // Returns navigation keys, not routes
  getHistoryLength(): number;
  getCurrentRoute(): string | null;  // Returns current navigation key
  
  // ===== TAB QUERIES (MDI Mode) =====
  
  getActiveTabs(): TabInfo[];  // Returns empty in SDI mode
  getCurrentTab(): TabInfo | null;  // Returns null in SDI mode
  closeTab(tabId: string): Promise<void>;  // Close tab (homepage tab kapatılamaz)
  pinTab(tabId: string): void;  // Pin tab (kapatılamaz hale getir)
  unpinTab(tabId: string): void;  // Unpin tab
  
  // ===== EVENT STREAMS =====
  
  navigationEvents: Observable<NavigationEvent>;  // RxJS Observable or similar
}
```

```dart
// Dart (Flutter)
abstract class IRouter {
  
  // ===== CORE NAVIGATION METHOD =====
  
  // Main navigation method - takes navigation item from backend
  Future<void> navigate({
    required NavigationType type,        // NavigationType enum
    NavigationVersion? version,          // NavigationVersion enum (defaults to v1)
    dynamic config,                      // View/workflow configuration (complex JSON, varies by type)
    Map<String, dynamic>? parameters,    // Key-value parameters to pass to the view
    bool activateIfExists = false        // MDI: activate existing tab instead of creating new one
  });
  
  // ===== BACK NAVIGATION =====
  
  void goBack();  // Back button implementation - goes to previous page
  
  // ===== ROUTER LIFECYCLE =====
  
  Future<void> initialize();
  
  // ===== MODE MANAGEMENT =====
  
  RouterMode getCurrentMode();
  Future<void> setMode(RouterMode mode);  // Runtime mode switching
  
  // ===== HOME PAGE MANAGEMENT =====
  
  Future<void> navigateToHomepage(NavigationItem navigationItem);  // Navigate to homepage from navigation (navigation'dan homepage key'i alınır)
  
  // ===== HISTORY QUERIES =====
  
  List<String> getNavigationHistory();  // Returns navigation keys, not routes
  int getHistoryLength();
  String? getCurrentRoute();            // Returns current navigation key
  
  // ===== TAB QUERIES (MDI Mode) =====
  
  List<TabInfo> getActiveTabs(); // Returns empty in SDI mode
  TabInfo? getCurrentTab();      // Returns null in SDI mode
  Future<void> closeTab(String tabId);  // Close tab (homepage tab kapatılamaz)
  void pinTab(String tabId);  // Pin tab (kapatılamaz hale getir)
  void unpinTab(String tabId);  // Unpin tab
  
  // ===== EVENT STREAMS =====
  
  Stream<NavigationEvent> get navigationEvents;
  
}
```

## 🔧 Enum Definitions

Router ile kullanılan enum tanımları:

```typescript
// TypeScript (Web)
// Navigation types - only navigable types (navigation.md ile uyumlu)
enum NavigationType {
  search = 'search',
  dynamicView = 'dynamicView',
  workflow = 'workflow',
  instance = 'instance',
  staticView = 'staticView',
  webView = 'webView'
}

// Navigation versions
enum NavigationVersion {
  v1 = 'v1',
  v2 = 'v2'
}

enum RouterMode {
  sdi = 'sdi',    // Single Document Interface
  mdi = 'mdi'     // Multi Document Interface
}

enum TabType {
  standard = 'standard',
  workflow = 'workflow',
  temporary = 'temporary',
  pinned = 'pinned'
}

enum NavigationEventType {
  pageChanged = 'pageChanged',
  historyChanged = 'historyChanged',
  navigationCompleted = 'navigationCompleted'
}

// Tab Info Structure (MDI Mode)
interface TabInfo {
  id: string;                    // Unique tab identifier
  navigationKey: string;         // Navigation item key
  title: string;                 // Tab title
  type: TabType;                 // Tab type
  pinned: boolean;                // Is tab pinned? (homepage is always pinned)
  closable: boolean;              // Can tab be closed? (homepage is not closable)
  createdAt: Date;               // Tab creation timestamp
  lastAccessed: Date;             // Last access timestamp
}
```

```dart
// Dart (Flutter)
// Navigation types - only navigable types (navigation.md ile uyumlu)
enum NavigationType {
  search,
  dynamicView,
  workflow,
  instance,
  staticView,
  webView
}

// Navigation versions
enum NavigationVersion {
  v1,
  v2
}

enum RouterMode {
  sdi,    // Single Document Interface
  mdi     // Multi Document Interface
}

enum TabType {
  standard,
  workflow,
  temporary,
  pinned
}

enum NavigationEventType {
  pageChanged,
  historyChanged,
  navigationCompleted
}

// Tab Info Structure (MDI Mode)
class TabInfo {
  final String id;                    // Unique tab identifier
  final String navigationKey;         // Navigation item key
  final String title;                 // Tab title
  final TabType type;                 // Tab type
  final bool pinned;                  // Is tab pinned? (homepage is always pinned)
  final bool closable;                // Can tab be closed? (homepage is not closable)
  final DateTime createdAt;            // Tab creation timestamp
  final DateTime lastAccessed;        // Last access timestamp
}
```


