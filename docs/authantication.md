# Kullanıcı Doğrulama

Kullanıcı doğrulama sistemi tamamen OAuth2 mekanizması ile çalışır. 

Kullanıcı token içerisinde, adına işlem yapılan müşteri subject olarak, subject adına işlem yapan kullanıcı/sistem bilgisi ise act alanında tanımlıdır.

## Access Token Türleri

- **device token**: Herhangi bir kullanıcı bilgisinin olmadığı, cihazın erişim için kullandığı, bir nevi anonymous token tipidir. Bu token tipinde subject her zaman "device" olur.
  - `act` ise `deviceId+installationId` kabul edilir.
- **user Token**: 1FA, 2FA gibi formatlarda bulunabilen, aslında kullanıcının ve müşterinin yani subject ve act önceden belli olduğu tokenlardır.

## Backend Hata Yönetimi

### 401 - Unauthorized (Token Yok/Geçersiz)

Bir servis erişiminde hiç token sağlanmamışsa backend 401 döner. Pratikte böyle bir response hiçbir zaman beklenmemektedir. Çünkü HTTP Client her koşulda bearer token ile gitmesi gerektiğini bilir.

**SDK Davranışı:**
- Request interceptor otomatik olarak mevcut token'ı `Authorization: Bearer <token>` header'ına ekler
- Eğer token yoksa veya geçersizse, backend 401 döner
- SDK, 401 hatası aldığında:
  1. Token refresh denemesi yapar (eğer refreshToken varsa)
  2. Refresh başarılıysa, orijinal request'i yeni token ile tekrar dener
  3. Refresh başarısızsa veya refreshToken yoksa, `auth.tokenExpired` event'i emit eder ve hatayı fırlatır

### 403 - Forbidden (Yetki Yetersiz)

Token ile gelen kullanıcının çağırdığı serviste yetkisi yok ise iki durum oluşur. Ya tokeni yükseltip mesela 1FA token'dan 2FA'ya geçerek yetki kazanır. Ya da hiçbir zaman yetkisi yoktur. Her iki durumda da backend 403 döner.

#### 1. Kalıcı Yetki Yetersizliği

Eğer kullanıcının her koşulda ilgili kaynağa erişimi yoksa direkt yetersiz yetki döner. 403 ile:

```json
{
  "error": "insufficient_permissions",
  "required_permissions": ["payments:approve"]
}
```

**SDK Davranışı:**
- `auth.insufficientPermissions` event'i emit eder
- Error object'inde `code: "403"`, `error: "insufficient_permissions"` ve `required_permissions` array'i bulunur
- Uygulama bu hatayı yakalayıp kullanıcıya uygun mesaj gösterebilir

#### 2. Step-Up Required (Token Yükseltme Gerekli)

Eğer bir üst seviye güvenlik lazımsa ise dönüş auth için gereken akış olacaktır.

```json
{
  "error": "step_up_required",
  "step_up": {
    "authorization_flow": "morph-idm:workflow:login-2fa",
    "required_auth_type": "2fa",
    "current_auth_type": "1fa"
  }
}
```

**SDK Davranışı:**
- `auth.stepUpRequired` event'i emit eder (uygulama bilgilendirme için)
- Response body'den `authorization_flow` bilgisini alır
- **Otomatik olarak upgrade flow'u başlatır** (`WorkflowManager` ile `authorization_flow` ID'sini kullanarak)
- Upgrade flow tamamlandığında (yeni token alındığında):
  1. Yeni token'ı kaydeder
  2. Orijinal request'i yeni token ile otomatik olarak tekrar dener
  3. Başarılı olursa response'u döner
- Bu özellikle deeplink'lerde çok pratiklik sağlar: Kullanıcı bir deeplink'e tıkladığında, yetki yoksa otomatik upgrade başlar, login tamamlanınca deeplink işlemi kaldığı yerden devam eder
## SDK Özellikleri

### Otomatik Token Injection

SDK, tüm API request'lerine otomatik olarak mevcut token'ı ekler:
- Request interceptor, `AuthorizationManager`'dan token alır
- `Authorization: Bearer <accessToken>` header'ını ekler
- Token yoksa veya expired ise header eklenmez (veya uygulama hatası alır)

### Token Refresh Mekanizması

- Token expire olmadan önce (varsayılan: 5 dakika) otomatik refresh yapar
- 401 hatası alındığında otomatik refresh denemesi yapar
- Refresh başarılıysa orijinal request'i tekrar dener
- Refresh başarısızsa token'ı temizler ve logout durumuna geçer

### Error Handling

SDK, auth hatalarını şu şekilde handle eder:

1. **401 Unauthorized:**
   - Token refresh denemesi
   - Başarısızsa `auth.tokenExpired` event
   - Token temizleme ve logout

2. **403 Forbidden - insufficient_permissions:**
   - `auth.insufficientPermissions` event
   - Error detayları ile birlikte

3. **403 Forbidden - step_up_required:**
   - `auth.stepUpRequired` event (bilgilendirme için)
   - Otomatik upgrade flow başlatma (`WorkflowManager` ile)
   - Upgrade tamamlandığında orijinal request'i otomatik retry

### Event Sistemi

AuthorizationManager aşağıdaki event'leri emit eder:

- `authenticated`: Başarılı authentication sonrası
- `authenticationFailed`: Authentication başarısız olduğunda
- `tokenRefreshed`: Token refresh başarılı olduğunda
- `loggedOut`: Logout yapıldığında
- `stateChange`: Auth state değiştiğinde
- `tokenExpired`: Token expire olduğunda ve refresh başarısız olduğunda
- `insufficientPermissions`: Kalıcı yetki yetersizliği durumunda
- `stepUpRequired`: Token upgrade gerektiğinde

## Eksikler ve İyileştirme Önerileri

### ✅ Mevcut Özellikler
- Token storage ve yönetimi
- Otomatik token refresh
- Auth state management
- Event system

### ⚠️ Eksik Özellikler (SDK'da implement edilmesi gerekenler)

1. **Otomatik Token Injection Interceptor**
   - Request interceptor'da AuthorizationManager'dan token alıp header'a ekleme
   - Token expired kontrolü request öncesi

2. **401 Error Handling**
   - Error interceptor'da 401 yakalama
   - Otomatik token refresh denemesi
   - Refresh sonrası request retry

3. **403 Error Handling**
   - Response body'den `step_up_required` parse etme
   - `insufficient_permissions` vs `step_up_required` ayrımı
   - Uygun event emit etme (`auth.insufficientPermissions` veya `auth.stepUpRequired`)
   - `step_up_required` durumunda otomatik upgrade flow başlatma (`WorkflowManager` ile)
   - Upgrade tamamlandığında orijinal request'i otomatik retry

4. **ApiError Type Güncellemesi**
   - `ApiError` type'ına `responseBody?: any` eklenmeli
   - Böylece error interceptor'da response body'ye erişilebilir

5. **Request Retry Mekanizması**
   - 401 sonrası refresh + retry
   - 403 step_up sonrası upgrade + retry (otomatik)

6. **Token Expiry Kontrolü**
   - Request öncesi token expiry kontrolü
   - Expired ise önceden refresh denemesi

### 📝 Backend Dönüş Formatı Önerileri

Mevcut backend dönüşleri yeterli görünüyor, ancak şu eklemeler faydalı olabilir:

1. **401 Response:**
```json
{
  "error": "unauthorized",
  "error_description": "Token expired or invalid",
  "can_refresh": true
}
```

2. **403 insufficient_permissions:**
```json
{
  "error": "insufficient_permissions",
  "required_permissions": ["payments:approve"],
  "user_permissions": ["payments:view"]
}
```

3. **403 step_up_required:**
```json
{
  "error": "step_up_required",
  "step_up": {
    "authorization_flow": "morph-idm:workflow:login-2fa",
    "required_auth_type": "2fa",
    "current_auth_type": "1fa",
    "reason": "Sensitive operation requires higher security level"
  }
}
```