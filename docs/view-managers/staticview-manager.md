# StaticViewManager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

StaticViewManager, statik view sayfalarının yönetimini sağlayan core SDK sınıfıdır.

## 🎯 Temel Amaç

Statik sayfa yönetimi, component lifecycle, route handling ve pre-built view component'larının yönetimini sağlamak. Navigation'da `"type": "staticView"` olarak tanımlanmış öğelerin client-side implementasyonunu gerçekleştirir.

## 🚀 Temel Sunduğu Hizmetler

* **Static Page Management**: Önceden tanımlanmış statik sayfaların yönetimi
* **Component Lifecycle**: Statik component'ların yaşam döngüsü yönetimi
* **Route Handling**: Statik route'ların yönetimi ve navigation (Router ile entegre)
* **Component Registry**: Statik component'ların kayıt ve yönetimi
* **Parameter Injection**: Statik view'lara parametre geçişi

## 💡 Kullanım Senaryoları

### **Static Dashboard Loading Senaryosu**

```typescript
// TypeScript (Web)
// Statik dashboard sayfasını yükle
const component = await staticViewManager.loadView({
  component: 'dashboardWidget',
  parameters: {
    userId: user.id,
    accountCount: accounts.length
  }
});
```

```dart
// Dart (Flutter)
// Statik dashboard sayfasını yükle
final widget = await staticViewManager.loadView(
  component: 'dashboardWidget',
  parameters: {
    'userId': user.id,
    'accountCount': accounts.length
  }
);
```

## 📚 Public Interface

```typescript
// TypeScript (Web)
interface IStaticViewManager {
  // ===== VIEW MANAGEMENT =====
  
  loadView(options: {
    component: string;
    parameters?: Record<string, any>;
  }): Promise<ViewComponent>;
  
  updateViewParameters(viewId: string, parameters: Record<string, any>): Promise<void>;
  refreshView(viewId: string): Promise<void>;
  unloadView(viewId: string): Promise<void>;
  
  // ===== COMPONENT REGISTRY =====
  
  registerComponent(name: string, builder: ComponentBuilder): void;
  unregisterComponent(name: string): void;
  getRegisteredComponents(): string[];
  
  // ===== ROUTE MANAGEMENT =====
  // Not: Route yönetimi Router ile entegre edilmiştir
  
  // ===== EVENT STREAMS =====
  
  viewEvents: Observable<StaticViewEvent>;  // RxJS Observable or similar
}
```

```dart
// Dart (Flutter)
abstract class IStaticViewManager {
  
  // ===== VIEW MANAGEMENT =====
  
  Future<Widget> loadView({
    required String component,
    Map<String, dynamic>? parameters
  });
  
  Future<void> updateViewParameters(String viewId, Map<String, dynamic> parameters);
  Future<void> refreshView(String viewId);
  Future<void> unloadView(String viewId);
  
  // ===== COMPONENT REGISTRY =====
  
  void registerComponent(String name, WidgetBuilder builder);
  void unregisterComponent(String name);
  List<String> getRegisteredComponents();
  
  // ===== ROUTE MANAGEMENT =====
  // Not: Route yönetimi Router ile entegre edilmiştir
  
  // ===== EVENT STREAMS =====
  
  Stream<StaticViewEvent> get viewEvents;
}
```

## 🔧 Enum Definitions

```dart
enum StaticViewEventType {
  viewLoaded,
  viewUnloaded,
  parametersUpdated,
  routeChanged
}

enum ComponentType {
  page,
  component,
  dialog,
  bottomSheet
}
```
