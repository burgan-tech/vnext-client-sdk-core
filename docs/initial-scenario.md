# Temel Senaryo

Bu dokümantasyon, SDK'nın temel kullanım senaryolarını ve özellikle authentication upgrade akışlarını test etmek için hazırlanmıştır.

## Basic Test

1. Kullanıcı uygulamayı açar (Device Homepage)
   - SDK cold start ile başlar
   - Device token ile otomatik authentication
   - Device homepage gösterilir

2. Kullanıcı gelen ekranda bulunan menülerden kullanıcı ol sürecini tamamlar
   - Kullanıcı kayıt akışı başlatılır
   - Kullanıcı bilgileri girilir ve kayıt tamamlanır

3. Kullanıcı oluşturduğu kullanıcı ile giriş yapar
   - Login akışı başlatılır (2FA login workflow)
   - Kullanıcı adı/şifre ile giriş yapılır
   - Login tamamlandığında hem 1FA hem 2FA token verilir
   - 1FA token (90 gün geçerli) secure store'da saklanır
   - 2FA token (5 dakika geçerli) aktif olarak kullanılır
   - 1FA homepage gösterilir

4. Kullanıcı uygulamayı kapatır
   - SDK cleanup yapılır
   - Token storage'da saklanır

5. Kullanıcı uygulamayı açar (1FA Homepage)
   - SDK warm start ile başlar
   - Stored 1FA token restore edilir (90 gün geçerli)
   - 1FA homepage gösterilir

6. Kullanıcı şifre değiştirme akışı çalıştırır
   - Şifre değiştirme workflow'u başlatılır
   - Mevcut şifre doğrulanır
   - Yeni şifre belirlenir

## Deep Link Test

### Senaryo 1: Uygulama Kapalı

1. Kullanıcı deep link ile şifre değişikliğine gelir
   - Uygulama cold start ile açılır
   - Deep link parse edilir (`deeplink_received` event)
   - Hedef: şifre değiştirme workflow'u

2. SDK davranışı:
   - Device token ile otomatik authentication
   - Deep link hedefi kaydedilir
   - Şifre değiştirme workflow'u başlatılır

3. Backend 403 `step_up_required` döner
   - `authorization_flow: "morph-idm:workflow:login-2fa"` bilgisi gelir
   - SDK otomatik olarak login workflow'unu başlatır

4. Kullanıcı login ekranına yönlendirilir
   - Login workflow'u (2FA) gösterilir
   - Kullanıcı giriş yapar

5. Login tamamlandığında:
   - Yeni token'lar kaydedilir (hem 1FA hem 2FA)
   - 1FA token (90 gün) secure store'da saklanır
   - 2FA token (5 dk) aktif olarak kullanılır
   - Orijinal request (şifre değiştirme) otomatik retry edilir
   - Şifre değiştirme workflow'u kaldığı yerden devam eder

6. Kullanıcı şifre değiştirir
   - Workflow tamamlanır

### Senaryo 2: Uygulama Açık - 1FA Token

1. Kullanıcı deep link ile şifre değişikliğine gelir
   - Uygulama açık ve 1FA token ile authenticated
   - Deep link parse edilir
   - Hedef: şifre değiştirme workflow'u

2. SDK davranışı:
   - Mevcut 1FA token ile şifre değiştirme workflow'u başlatılır

3. Backend 403 `step_up_required` döner
   - `authorization_flow: "morph-idm:workflow:login-2fa"` bilgisi gelir
   - SDK otomatik olarak login workflow'unu başlatır

4. Kullanıcı login ekranına yönlendirilir
   - Login workflow'u (2FA) gösterilir
   - Kullanıcı tekrar giriş yapar (full login)

5. Login tamamlandığında:
   - Yeni token'lar kaydedilir (hem 1FA hem 2FA)
   - 1FA token (90 gün) güncellenir ve saklanır
   - 2FA token (5 dk) aktif olarak kullanılır
   - Orijinal request (şifre değiştirme) otomatik retry edilir
   - Şifre değiştirme workflow'u kaldığı yerden devam eder

6. Kullanıcı şifre değiştirir
   - Workflow tamamlanır

### Senaryo 3: Uygulama Açık - 2FA Token

1. Kullanıcı deep link ile şifre değişikliğine gelir
   - Uygulama açık ve 2FA token ile authenticated
   - Deep link parse edilir
   - Hedef: şifre değiştirme workflow'u

2. SDK davranışı:
   - Mevcut 2FA token ile şifre değiştirme workflow'u başlatılır
   - Backend 200 OK döner (yeterli yetki var)

3. Kullanıcı şifre değiştirir
   - Workflow direkt olarak gösterilir
   - Kullanıcı şifre değiştirme işlemini tamamlar

## DataManager Test

### State Persistence Test

1. Kullanıcı login yapar (2FA login, sonucunda 1FA ve 2FA token)
   - Auth state DataManager'a yazılır
   - User bilgileri persistent scope'a yazılır
   - 1FA token (90 gün) persistent scope'da saklanır
   - 2FA token (5 dk) aktif olarak kullanılır

2. Kullanıcı bazı ayarları değiştirir
   - Ayarlar persistent scope'a yazılır
   - UI güncellenir

3. Kullanıcı uygulamayı kapatır
   - SDK cleanup yapılır
   - Persistent data storage'da saklanır

4. Kullanıcı uygulamayı açar
   - SDK warm start ile başlar
   - ✓ Persistent data restore edilmiş olmalı
   - ✓ User bilgileri korunmuş olmalı
   - ✓ Ayarlar korunmuş olmalı

### Scope Management Test

1. Kullanıcı login yapar
   - Auth token → persistent scope
   - Session data → inMemory scope
   - User preferences → persistent scope

2. Kullanıcı uygulamayı kapatır ve açar
   - ✓ Auth token korunmuş olmalı (persistent)
   - ✓ Session data silinmiş olmalı (inMemory)
   - ✓ User preferences korunmuş olmalı (persistent)

### Data Binding Test (UI Reaktivite)

1. UI component DataManager'a bind olur
   - `bindData()` ile user bilgisi bağlanır
   - Initial data UI'da gösterilir

2. Backend'den user bilgisi güncellenir
   - DataManager'da user data güncellenir
   - ✓ UI otomatik olarak güncellenmeli (reaktif)

3. Kullanıcı form'da değişiklik yapar
   - DataManager'a yeni değer yazılır
   - ✓ Diğer bind edilmiş component'lar güncellenmeli

### Auth State Continuity Test

1. Kullanıcı login yapar (2FA login, sonucunda 1FA ve 2FA token)
   - User data DataManager'a yazılır
   - Auth state: `authenticated`, `tokenType: 1fa` (aktif token)
   - 1FA token (90 gün) persistent scope'da saklanır
   - 2FA token (5 dk) aktif olarak kullanılır

2. 2FA token expire olur (5 dk sonra)
   - Aktif token 1FA'ya düşer
   - Auth state: `tokenType: 1fa`

3. Kullanıcı 2FA gerektiren işlem yapar
   - Backend 403 `step_up_required` döner
   - SDK otomatik login workflow'unu başlatır (2FA)

4. Login tamamlandığında:
   - ✓ User data korunmuş olmalı
   - ✓ Yeni token'lar kaydedilir (1FA ve 2FA)
   - ✓ Auth state güncellenmiş olmalı: `tokenType: 2fa`
   - ✓ Önceki session data'sı silinmemiş olmalı

### Batch Operations Test

1. Kullanıcı birden fazla data günceller
   - `batchSet()` ile toplu güncelleme yapılır
   - Tüm değişiklikler atomik olarak uygulanır

2. Batch operation tamamlanır
   - ✓ Tüm data'lar güncellenmiş olmalı
   - ✓ Tek bir event emit edilmiş olmalı (her biri için ayrı değil)

### Data Migration Test

1. Uygulama v1'den v2'ye güncellenir
   - Yeni data schema'sı var
   - Migration logic çalışır

2. Uygulama açılır
   - ✓ Eski data yeni schema'ya migrate edilmiş olmalı
   - ✓ Data kaybı olmamalı

## Test Senaryoları Özeti

| Senaryo | Uygulama Durumu | Token Tipi | Backend Response | SDK Davranışı |
|---------|----------------|------------|------------------|----------------|
| Basic Test | Kapalı → Açık | Device → Login (1FA+2FA) | 200 OK | Login workflow, token'lar kaydedilir |
| Deep Link 1 | Kapalı | Device | 403 step_up | Otomatik login workflow (2FA), retry |
| Deep Link 2 | Açık | 1FA | 403 step_up | Otomatik login workflow (2FA), retry |
| Deep Link 3 | Açık | 2FA | 200 OK | Direkt workflow gösterimi |
| State Persistence | Kapalı → Açık | 1FA | - | Persistent data restore |
| Scope Management | Kapalı → Açık | - | - | InMemory temizlenir, Persistent korunur |
| Data Binding | Açık | - | - | UI reaktif güncelleme |
| Auth Continuity | Açık | 1FA → Login (2FA) | 403 step_up | User data korunur, yeni token'lar kaydedilir |
| Batch Operations | Açık | - | - | Atomik güncelleme, tek event |
| Data Migration | Kapalı → Açık | - | - | Schema migration, data korunur |

## Önemli Noktalar

1. **Tek Login Akışı**: Her zaman 2FA login akışı kullanılır. Login sonucunda hem 1FA (90 gün) hem 2FA (5 dk) token verilir.
2. **Otomatik Login Flow**: SDK, 403 `step_up_required` aldığında otomatik olarak login workflow'unu başlatır
3. **Request Retry**: Login tamamlandığında orijinal request otomatik olarak tekrar denenir
4. **Deep Link Continuity**: Deep link hedefi kaydedilir ve login sonrası kaldığı yerden devam eder
5. **Token Management**: 
   - 1FA token: 90 gün geçerli, refresh edilemez, sadece login ile yenilenir
   - 2FA token: 5 dakika geçerli, refresh edilebilir (rotating strategy)
   - Her login sonrası yeni token'lar kaydedilir ve state güncellenir
6. **State Persistence**: Persistent scope'daki data'lar uygulama kapatılsa bile korunur
7. **Data Binding**: UI component'lar DataManager'a bind edildiğinde otomatik reaktif güncelleme sağlanır
8. **Batch Operations**: Toplu güncellemeler atomik olarak uygulanır ve tek event emit edilir
