# Uygulama Yaşam Döngüleri (Application Lifecycle)

> **Not:** Bu lifecycle'lar hem mobil (Flutter) hem de web (TypeScript/Vue) uygulamaları için ortak isimlendirme kullanır.

## Cold Start (Startup)

* **100.** **DataManager.Init**: Bu core sınıf direkt olarak güvenli alanda verileri saklamak için kullanılır. İçerisinde secure storage mantığını da, cache mantığını da yaşatır. 
* **200.** İlk açılışta init edilmesi gereken SDK'lar, loglama seviyesi gibi temel uygulama konfigürasyonları backend'den edinilir. Ve verilen sırayla init edilir. [`client-function-config.json`](docs/sample-service-responses/client-function-config.json) örneğinde olduğu gibi, backend'de client akışının config fonksiyonu konfigürasyon içeriğini dönecektir.
* **300.** **Auth-Manager.Init**: Cihaz/Kullanıcı doğrulama sistemi, auth-manager init edilir. Eğer hiç login olunmamışsa `deviceId` ve `InstallationId` ile device token oluşturulur. Giriş yapılmış ise, giriş yapmış son kullanıcının 1FA access token'ı kullanılır. Login sonrası ise zaten 2FA token kullanılır.
* **400.** Token seviyesine ve kullanıcıya göre homepage backend'den çekilerek kullanıcıya gösterilir. (İlk kurulum, 1FA durumu, 2FA durumu gibi farklı homepage'ler olabilir)
* **500.** Token seviyesine ve kullanıcıya göre navigation bilgisi backend'den istenir. **Not:** Navigation homepage'den bağımsızdır, ancak token seviyesine göre farklılaşır. Her homepage durumuna göre navigation yapısı da değişebilir.

### first_run

* **101.** **InstallationId**: Uygulama ilk açıldığında bir ULID formatında cihaz için bir anahtar yaratılır. Bu anahtar uygulama kurulumunu tanımak için vardır. `DataManager` ile `device/installationId` anahtarı ile güvenli bir şekilde `DataScope.persistent`, `DataContext.device` olarak kayıt altına alınır.
* **201.** Eğer başlatılan SDK'ların ya da diğer bileşenlerin first_run'da çağrılması gereken özel fonksiyonları var ise bu noktada çağrılır.

## Warm Start (Startup) 
  - Mobil: Uygulama arka planda suspended/paused durumdaydı veya hala aktif ama foreground'da değildi. Process var, memory'de tutuluyor. Arka plana atıp geri geldiğinde, notification'dan geri dönme, split screen'den tam ekrana geçme gibi durumlarda bu event tetiklenir. `resumed` durumu da bu event içinde değerlendirilir.
  - Web: Tab/pencere visibility değişti (başka tab'a gidip geri dönme, visibility: hidden → visible) veya sayfa cache'den restore edildi (back/forward navigation, DOM state korunmuş).
  - **Not:** Process/memory var, uygulama durdurulmuş veya hala aktif olabilir. Geliştirme açısından fark yoktur - her iki durumda da aynı işlemler yapılır (state restore, UI refresh, vb.). Bu event aynı zamanda uygulamanın ön plana gelmesi (foreground) ve `resumed` durumu anlamına gelir.
  - **Önemli:** SDK'lar zaten init edilmiş durumda olduğu için tekrar init edilmez. Sadece state restore, UI refresh, WebSocket reconnection gibi işlemler yapılır.

## Durum Değişiklikleri (State Changes)

- **background**
  - Mobil: Uygulama arka plana itildi (app state: background, paused, inactive, suspended durumları dahil. iOS: applicationDidEnterBackground, Android: onPause, onDetachedFromWindow)
  - Web: Tab/pencere gizlendi (visibility: hidden, blur event, pagehide event)
  - **Not:** `inactive`, `paused`, `suspended`, `detached` durumları da `background` event'i içinde değerlendirilir. Geliştirme açısından fark yoktur - uygulama arka planda.

## Sonlandırma (Termination)

- **terminated**
  - Mobil: Uygulama sonlandırıldı veya sonlandırılacak (process kill edildi, iOS: applicationWillTerminate)
  - Web: Sayfa kapatıldı veya kapatılacak (unload event, beforeunload event, tab kapatıldı)
  - **Not:** `will_terminate` durumu da bu event içinde değerlendirilir. Geliştirme açısından fark yoktur - her iki durumda da cleanup işlemleri yapılır.

## Online/Offline (Network State)

- **online**
  - Mobil: İnternet bağlantısı geldi veya ağ durumu değişti (WiFi ↔ Mobile data)
  - Web: İnternet bağlantısı geldi (navigator.onLine: true, online event)
  - **Not:** `network_connected` ve `network_changed` durumları da bu event içinde değerlendirilir.

- **offline**
  - Mobil: İnternet bağlantısı kesildi
  - Web: İnternet bağlantısı kesildi (navigator.onLine: false, offline event)
  - **Not:** `network_disconnected` durumu da bu event içinde değerlendirilir.


## Performans (Performance)

- **performance_warning**
  - Mobil: Cihaz yeterli olmamaya başladı (düşük bellek uyarısı, performans uyarısı - sistem tarafından bildirilir)
  - Web: Cihaz yeterli olmamaya başladı (Performance API, Memory API ile yakalanabilir, ancak sınırlı)
  - **Not:** `low_memory` durumu da bu event içinde değerlendirilir. Cihaz kaynaklarının yetersiz kaldığı durumlar için uyarı ve log amaçlı kullanılır.

## Hata (Error)

- **error_occurred**
  - Mobil: Global hata oluştu (unhandled exception, crash yakalanması)
  - Web: Global hata oluştu (unhandled error, unhandled promise rejection)
  - **Not:** Global error handling için kullanılır. Hata yakalandığında bu event tetiklenir.

## Güncelleme (Update)

- **update_available**
  - Mobil: Güncelleme mevcut (uygulama store'dan yeni versiyon mevcut)
  - Web: Service Worker güncellemesi mevcut (PWA için, service worker update event)
  - **Not:** `update_installed` durumu da bu event içinde değerlendirilebilir. Web'de genelde sayfa yenilendiğinde otomatik güncelleme olur, bu event özellikle PWA Service Worker update'leri için anlamlıdır.

## Konum (Location)

- **location_enabled** - Konum servisi açıldı
- **location_disabled** - Konum servisi kapatıldı

## Bildirim (Notification)

- **notification_permission_changed**
  - Mobil: Bildirim izin durumu değişti (granted → denied veya denied → granted)
  - Web: Bildirim izin durumu değişti (Notification.permission değişikliği, genelde uygulama yeniden açıldığında kontrol edilir)
  - **Not:** İzin durumu değişikliğini yakalamak için lifecycle event'i. Web'de genelde uygulama yeniden açıldığında kontrol edilir, mobilde runtime'da değişiklik dinlenebilir.

- **notification_received**
  - Mobil: Bildirim alındı (push notification, local notification)
  - Web: Bildirim alındı (Web Push API, Service Worker push event)

- **notification_clicked**
  - Mobil: Bildirime tıklandı (notification tap event)
  - Web: Bildirime tıklandı (notification click event, Service Worker notificationclick event)

## Deeplink (Deep Linking)

- **deeplink_received**
  - Mobil: Deeplink alındı (uygulama açıkken veya kapalıyken deeplink ile açıldığında, iOS: URL scheme, Android: Intent)
  - Web: Deeplink alındı (özel endpoint ile, örn: `xxx.com/link?param=value`, URL query params veya path-based routing)
  - **Not:** Deeplink geldiğinde uygulama durumuna göre farklı davranışlar sergilenebilir:
    - Uygulama kapalıyken deeplink ile açıldığında: `cold_start` veya `first_run` + `deeplink_received`
    - Uygulama açıkken deeplink geldiğinde: `warm_start` + `deeplink_received`
    - Deeplink parametreleri parse edilir ve ilgili sayfa/akışa yönlendirme yapılır
