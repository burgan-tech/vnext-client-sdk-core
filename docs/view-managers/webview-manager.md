# WebViewManager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

WebViewManager, web view sayfalarının yönetimini sağlayan core SDK sınıfıdır.

## 🎯 Temel Amaç

WebView lifecycle yönetimi, URL handling, bridge communication ve güvenlik yönetimini sağlamak. Navigation'da `"type": "webView"` olarak tanımlanmış öğelerin client-side implementasyonunu gerçekleştirir.

## 🚀 Temel Sunduğu Hizmetler

* **WebView Lifecycle**: WebView'ların yaşam döngüsü yönetimi
* **URL Handling**: URL yükleme, yönlendirme ve güvenlik kontrolleri
* **Bridge Communication**: JavaScript ↔ Flutter communication
* **Security Management**: Güvenli web içerik yükleme
* **Performance Optimization**: WebView caching ve performance

## 💡 Kullanım Senaryoları

### **External URL Loading Senaryosu**

```typescript
// TypeScript (Web)
// Harici web sayfası yükle (iframe veya yeni tab)
const webViewId = await webViewManager.createWebView({
  url: 'https://example.com/terms',
  config: {
    enableJavaScript: true,
    enableDomStorage: true,
    allowNavigation: false,
    method: 'get'  // Navigation'dan gelen config
  }
});
```

```dart
// Dart (Flutter)
// Harici web sayfası yükle
final webViewId = await webViewManager.createWebView(
  url: 'https://example.com/terms',
  config: {
    'enableJavaScript': true,
    'enableDomStorage': true,
    'allowNavigation': false,
    'method': 'get'  // Navigation'dan gelen config
  }
);
```

## 📚 Public Interface

```typescript
// TypeScript (Web)
interface IWebViewManager {
  // ===== WEBVIEW LIFECYCLE =====
  
  createWebView(options: {
    url: string;
    config?: {
      method?: 'get' | 'post';
      enableJavaScript?: boolean;
      enableDomStorage?: boolean;
      allowNavigation?: boolean;
      [key: string]: any;
    };
  }): Promise<string>;  // Returns webViewId
  
  loadUrl(webViewId: string, url: string): Promise<void>;
  reload(webViewId: string): Promise<void>;
  goBack(webViewId: string): Promise<void>;
  goForward(webViewId: string): Promise<void>;
  destroyWebView(webViewId: string): Promise<void>;
  
  // ===== JAVASCRIPT BRIDGE =====
  // Not: Web platformunda iframe veya yeni tab kullanılır, bridge sınırlıdır
  
  evaluateJavaScript(webViewId: string, script: string): Promise<any>;
  addJavaScriptHandler(name: string, handler: Function): void;
  removeJavaScriptHandler(name: string): void;
  
  // ===== SECURITY & PERMISSIONS =====
  
  isUrlAllowed(url: string): boolean;
  setPermissions(permissions: Record<string, boolean>): Promise<void>;
  
  // ===== EVENT STREAMS =====
  
  webViewEvents: Observable<WebViewEvent>;  // RxJS Observable or similar
}
```

```dart
// Dart (Flutter)
abstract class IWebViewManager {
  
  // ===== WEBVIEW LIFECYCLE =====
  
  Future<String> createWebView({
    required String url,
    Map<String, dynamic>? config
  });
  
  Future<void> loadUrl(String webViewId, String url);
  Future<void> reload(String webViewId);
  Future<void> goBack(String webViewId);
  Future<void> goForward(String webViewId);
  Future<void> destroyWebView(String webViewId);
  
  // ===== JAVASCRIPT BRIDGE =====
  
  Future<dynamic> evaluateJavaScript(String webViewId, String script);
  void addJavaScriptHandler(String name, Function handler);
  void removeJavaScriptHandler(String name);
  
  // ===== SECURITY & PERMISSIONS =====
  
  bool isUrlAllowed(String url);
  Future<void> setPermissions(Map<String, bool> permissions);
  
  // ===== EVENT STREAMS =====
  
  Stream<WebViewEvent> get webViewEvents;
}
```

## 🔧 Enum Definitions

```dart
enum WebViewEventType {
  pageStarted,
  pageFinished,
  pageError,
  navigationRequest,
  jsMessage
}

enum WebViewPermission {
  camera,
  microphone,
  location,
  notifications
}
```
