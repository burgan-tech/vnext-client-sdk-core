# AutoBind Data Sources

`x-autoBind` property'si için kullanılabilecek client-side veri kaynaklarının dokümantasyonu. Bu veriler client SDK DataManager tarafından yönetilir ve transition schema'larında otomatik olarak doldurulabilir.

> **📝 Not:** Storage türü `DataContext`'e göre otomatik belirlenir. Geliştirici storage belirtmez.

---

## 📍 DataContext ve Storage Mapping

| DataContext | Storage Altyapısı | Encryption | Açıklama |
|-------------|-------------------|------------|----------|
| `device` | **Secure Storage** | ❌ | Cihaz verileri (bootstrap için şifresiz) |
| `user` | **Secure Storage** | ✅ Şifreli | Kullanıcı verileri |
| `scope` | **Secure Storage** | ✅ Şifreli | İşlem yapılan müşteri/kapsam |
| `workflowInstance` | In-Memory | ❌ | İş akışı instance verisi (geçici) |
| `workflowTransition` | In-Memory | ❌ | Form/transition verisi (geçici) |
| `artifact` | **Local Storage** | ❌ | Render içerikleri, JSON (cache, TTL ile) |
| `secureMemory` | In-Memory | ❌ | Hassas runtime verileri (encryption key). ASLA persist edilmez! |

### Storage Altyapıları

| Altyapı | Açıklama | Platform Örnekleri |
|---------|----------|-------------------|
| **Secure Storage** | Platform-native güvenli storage. App sandbox içinde. | iOS Keychain, Android EncryptedSharedPreferences |
| **Local Storage** | Normal persistent storage. Cache için uygun. | Web localStorage, Android SharedPreferences, iOS UserDefaults |
| **In-Memory** | RAM'de tutulur, persist edilmez. | JavaScript Map, Dart Map |

> **🐔🥚 Bootstrap:** `device` context şifrelenmez çünkü Device Register için `deviceId` ve `installationId` gerekli. Key almadan bu bilgileri okuyamazdık → döngü!

> **🔐 Encryption Key:** Device Register API'den alınır ve `secureMemory` context'ine yazılır (`x-autoStore` ile otomatik). `deviceId + installationId` kombinasyonuna göre backend tarafından üretilir.

---

## 🔑 Dinamik Key Değişkenleri

Key'lerde iki dinamik değişken kullanılabilir:

| Değişken | Açıklama | Örnek Değer | Resolve Mekanizması |
|----------|----------|-------------|---------------------|
| `$ActiveUser` | Login olmuş kullanıcı (çalışan, temsilci) | `"employee123"` | `DataManager.setActiveUser()` ile set edilir, `DataManager.getActiveUser()` ile okunur |
| `$ActiveScope` | İşlem yapılan müşteri/kapsam | `"C987654321"` | `DataManager.setActiveScope()` ile set edilir, `DataManager.getActiveScope()` ile okunur |

**Resolve Mekanizması:**
- SDK, `x-autoBind` çalıştığında key içindeki `$ActiveUser` ve `$ActiveScope` değişkenlerini otomatik olarak resolve eder
- `$ActiveUser` → `DataManager.getActiveUser()` değeri ile replace edilir
- `$ActiveScope` → `DataManager.getActiveScope()` değeri ile replace edilir
- Eğer değişken set edilmemişse (undefined/null), key resolve edilemez ve hata oluşur

---

## 🔐 SecureMemory-Level Data (`DataContext.secureMemory`)

SecureMemory seviyesindeki veriler **sadece runtime'da** tutulur ve **asla persist edilmez**. Encryption key gibi hassas veriler için kullanılır. **Storage: In-Memory ONLY**

### encryption/key
Secure storage'ı açmak için kullanılan şifreleme anahtarı.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| (root) | string | Encryption key (Device Register'dan gelir) | `"KEY-ABC-123-XYZ"` |

**Örnek x-autoStore (Device Register Response Schema):**
```json
{
  "encryptionKey": {
    "type": "string",
    "x-autoStore": {
      "context": "secureMemory",
      "key": "encryption/key"
    }
  }
}
```

> **⚠️ Güvenlik:** Bu context'e yazılan veriler **asla disk'e yazılmaz**. App kapanınca kaybolur, tekrar açılınca Device Register gerekir.

---

## 📱 Device-Level Data (`DataContext.device`)

Device seviyesindeki veriler tüm kullanıcılar için ortaktır ve cihaza özgüdür. **Storage: Secure Storage (şifresiz - bootstrap için)**

> **⚠️ Not:** `device` context Secure Storage'da tutulur ama şifrelenmez. `deviceId` ve `installationId` Device Register için gerekli olduğundan, key almadan okunabilmeli.

### info
Cihaz tanımlama bilgileri.

| dataPath | Tip | Açıklama | Örnek | Nasıl Elde Edilir |
|----------|-----|----------|-------|-------------------|
| `deviceId` | string | Unique cihaz tanımlayıcısı | `"d8a7b6c5-4e3f-2a1b-9c8d-7e6f5a4b3c2d"` | Uygulama açıldığında kontrol edilir, yoksa sistemden çekilir (iOS: identifierForVendor, Android: Android ID) ve `device/info` key'ine kaydedilir |
| `installationId` | string | Uygulama kurulum tanımlayıcısı | `"i1a2b3c4-5d6e-7f8g-9h0i-j1k2l3m4n5o6"` | İlk açılışta (first_run) kontrol edilir, yoksa ULID formatında generate edilir ve `device/info` key'ine kaydedilir |
| `platform` | string | Platform türü | `"web"`, `"ios"`, `"android"` | SDK başlatıldığında runtime'da otomatik tespit edilir (browser detection, OS detection) |
| `osVersion` | string | İşletim sistemi versiyonu | `"14.0"`, `"Windows 11"` | Sistem API'lerinden otomatik çekilir (iOS: UIDevice.systemVersion, Android: Build.VERSION.RELEASE, Web: navigator.userAgent) |
| `appVersion` | string | Uygulama versiyonu | `"1.2.3"` | Uygulama build bilgisinden alınır (package.json version, Info.plist CFBundleShortVersionString, build.gradle versionName) |

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "device",
    "key": "info",
    "dataPath": "deviceId"
  }
}
```

---

### capabilities
Cihaz yetenekleri ve özellikleri.

| dataPath | Tip | Açıklama | Örnek | Nasıl Elde Edilir |
|----------|-----|----------|-------|-------------------|
| `biometricAvailable` | boolean | Biyometrik doğrulama desteği | `true` | Sistem API'lerinden kontrol edilir (iOS: LocalAuthentication.canEvaluatePolicy, Android: BiometricManager.canAuthenticate) |
| `biometricType` | string | Biyometrik türü | `"fingerprint"`, `"faceId"`, `"none"` | Sistem API'lerinden tespit edilir (iOS: LABiometryType, Android: BiometricManager.BIOMETRIC_*) |
| `pushEnabled` | boolean | Push notification izni | `true` | Platform notification permission API'lerinden kontrol edilir (iOS: UNUserNotificationCenter, Android: NotificationManager.areNotificationsEnabled) |
| `cameraAvailable` | boolean | Kamera erişimi | `true` | Sistem API'lerinden kontrol edilir (MediaDevices.getUserMedia, AVCaptureDevice) |
| `locationAvailable` | boolean | Konum erişimi | `true` | Platform location permission API'lerinden kontrol edilir (navigator.geolocation, CLLocationManager) |

---

### network
Ağ durumu bilgileri.

| dataPath | Tip | Açıklama | Örnek | Nasıl Elde Edilir |
|----------|-----|----------|-------|-------------------|
| `isOnline` | boolean | İnternet bağlantısı durumu | `true` | Network API'lerinden real-time kontrol edilir (navigator.onLine, ConnectivityManager, Network framework) |
| `connectionType` | string | Bağlantı türü | `"wifi"`, `"cellular"`, `"ethernet"` | Network API'lerinden tespit edilir (NetworkInformation.type, NetworkCapabilities) |
| `effectiveType` | string | Efektif bağlantı hızı | `"4g"`, `"3g"`, `"slow-2g"` | Network API'lerinden hesaplanır (NetworkInformation.effectiveType, TelephonyManager.getNetworkType) |

---

### locale
Cihaz dil ve bölge ayarları.

| dataPath | Tip | Açıklama | Örnek | Nasıl Elde Edilir |
|----------|-----|----------|-------|-------------------|
| `language` | string | Sistem dili (ISO 639-1) | `"tr"`, `"en"` | Sistem locale ayarlarından otomatik çekilir (navigator.language, NSLocale.preferredLanguages, Locale.getDefault) |
| `region` | string | Bölge kodu (ISO 3166-1) | `"TR"`, `"US"` | Sistem locale ayarlarından otomatik çekilir (Intl.DateTimeFormat().resolvedOptions().timeZone, NSLocale.current.regionCode) |
| `timezone` | string | Zaman dilimi | `"Europe/Istanbul"` | Sistem timezone ayarlarından otomatik çekilir (Intl.DateTimeFormat().resolvedOptions().timeZone, NSTimeZone.local) |
| `locale` | string | Tam locale | `"tr-TR"`, `"en-US"` | Sistem locale ayarlarından otomatik çekilir (language + region kombinasyonu) |

---

### pushToken
Push notification token bilgileri.

| dataPath | Tip | Açıklama | Örnek | Nasıl Elde Edilir |
|----------|-----|----------|-------|-------------------|
| `token` | string | Push notification token | `"fGhJkLmNoPqRsTuVwXyZ1234567890"` | Push provider SDK'larından alınır (FCM: getToken(), APNS: didRegisterForRemoteNotifications, Huawei: getToken()) ve `device/pushToken` key'ine kaydedilir. Token değiştiğinde otomatik olarak backend'e sync edilir (Device Register veya Push Token Update endpoint'i ile) |
| `provider` | string | Push provider (FCM, APNS, Huawei) | `"firebase"`, `"apns"`, `"huawei"` | Platform ve yapılandırmaya göre otomatik belirlenir (iOS: apns, Android: firebase/huawei) |
| `platform` | string | Platform (iOS, Android, Web) | `"ios"`, `"android"`, `"web"` | SDK başlatıldığında runtime'da otomatik tespit edilir |
| `registeredAt` | string | Token kayıt tarihi (ISO 8601) | `"2025-01-15T10:30:00Z"` | Token alındığında otomatik olarak mevcut tarih/saat ile kaydedilir |

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "device",
    "key": "pushToken",
    "dataPath": "token"
  }
}
```

**Örnek x-autoStore (Push Token Registration Response Schema):**
```json
{
  "pushToken": {
    "type": "string",
    "x-autoStore": {
      "context": "device",
      "key": "pushToken",
      "dataPath": "token"
    }
  },
  "provider": {
    "type": "string",
    "x-autoStore": {
      "context": "device",
      "key": "pushToken",
      "dataPath": "provider"
    }
  }
}
```

**Push Token Sync Mekanizması:**

1. **İlk Token Alımı:**
   - Push provider SDK'sı token'ı alır
   - Token `device/pushToken` key'ine kaydedilir
   - Device Register sırasında token backend'e gönderilir

2. **Token Değişikliği:**
   - Token refresh olduğunda (FCM: onTokenRefresh, APNS: didUpdatePushCredentials)
   - Yeni token `device/pushToken` key'ine kaydedilir
   - Otomatik olarak backend'e sync edilir (Push Token Update endpoint'i ile)

3. **Sync Endpoint:**
   - Device Register: Token ilk kayıt sırasında gönderilir
   - Push Token Update: Token değiştiğinde güncelleme endpoint'ine gönderilir

4. **Token Refresh:**
   - FCM: `onTokenRefresh()` callback'i tetiklendiğinde
   - APNS: `didUpdatePushCredentials()` delegate metodu çağrıldığında
   - Huawei: Token refresh event'i geldiğinde

---

### marketing
Store linkleri, tracking kodları ve marketing bilgileri.

| dataPath | Tip | Açıklama | Örnek | Nasıl Elde Edilir |
|----------|-----|----------|-------|-------------------|
| `appStoreUrl` | string | iOS App Store linki | `"https://apps.apple.com/app/id123456789"` | Client config'den alınır ve `device/marketing` key'ine kaydedilir |
| `playStoreUrl` | string | Google Play Store linki | `"https://play.google.com/store/apps/details?id=com.example.app"` | Client config'den alınır ve `device/marketing` key'ine kaydedilir |
| `huaweiStoreUrl` | string | Huawei AppGallery linki | `"https://appgallery.huawei.com/app/C123456789"` | Client config'den alınır ve `device/marketing` key'ine kaydedilir |
| `updateAvailable` | boolean | Güncelleme mevcut mu? | `true` | Store API'lerinden kontrol edilir veya client config'den gelir |
| `latestVersion` | string | En son uygulama versiyonu | `"1.3.0"` | Store API'lerinden veya client config'den alınır |
| `forceUpdate` | boolean | Zorunlu güncelleme var mı? | `false` | Client config'den alınır |
| `gtmId` | string | Google Tag Manager Container ID | `"GTM-XXXXXXX"` | Client config'den alınır ve `device/marketing` key'ine kaydedilir |
| `campaignCode` | string | Kampanya kodu (deep link, referrer vb.) | `"summer2024"`, `"referral123"` | Deep link parse edildiğinde veya referrer'dan alınır, `device/marketing` key'ine kaydedilir |
| `utmSource` | string | UTM source parametresi | `"google"`, `"facebook"` | Deep link URL'inden veya referrer'dan parse edilir, `device/marketing` key'ine kaydedilir |
| `utmMedium` | string | UTM medium parametresi | `"cpc"`, `"email"` | Deep link URL'inden veya referrer'dan parse edilir, `device/marketing` key'ine kaydedilir |
| `utmCampaign` | string | UTM campaign parametresi | `"summer_sale"` | Deep link URL'inden veya referrer'dan parse edilir, `device/marketing` key'ine kaydedilir |
| `utmTerm` | string | UTM term parametresi | `"loan"`, `"credit"` | Deep link URL'inden veya referrer'dan parse edilir, `device/marketing` key'ine kaydedilir |
| `utmContent` | string | UTM content parametresi | `"banner_ad"` | Deep link URL'inden veya referrer'dan parse edilir, `device/marketing` key'ine kaydedilir |
| `referrer` | string | Uygulama kurulum referrer'ı | `"partner_app"`, `"website"` | İlk kurulumda (first_run) referrer bilgisi alınır (Android: InstallReferrer, iOS: App Store referrer) ve `device/marketing` key'ine kaydedilir |
| `installDate` | string | Uygulama kurulum tarihi (ISO 8601) | `"2025-01-15T10:30:00Z"` | İlk açılışta (first_run) mevcut tarih/saat ile `device/marketing` key'ine kaydedilir |

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "device",
    "key": "marketing",
    "dataPath": "playStoreUrl"
  }
}
```

**Örnek x-autoBind (Kampanya Kodu):**
```json
{
  "x-autoBind": {
    "context": "device",
    "key": "marketing",
    "dataPath": "campaignCode"
  }
}
```

**Örnek x-autoStore (Client Config Response Schema):**
```json
{
  "marketing": {
    "type": "object",
    "x-autoStore": {
      "context": "device",
      "key": "marketing"
    },
    "properties": {
      "appStoreUrl": { "type": "string" },
      "playStoreUrl": { "type": "string" },
      "huaweiStoreUrl": { "type": "string" },
      "updateAvailable": { "type": "boolean" },
      "latestVersion": { "type": "string" },
      "forceUpdate": { "type": "boolean" },
      "gtmId": { "type": "string" },
      "campaignCode": { "type": "string" },
      "utmSource": { "type": "string" },
      "utmMedium": { "type": "string" },
      "utmCampaign": { "type": "string" },
      "utmTerm": { "type": "string" },
      "utmContent": { "type": "string" },
      "referrer": { "type": "string" },
      "installDate": { "type": "string" }
    }
  }
}
```

**Örnek x-autoStore (Deep Link ile Gelen Kampanya Kodu):**
```json
{
  "campaignCode": {
    "type": "string",
    "x-autoStore": {
      "context": "device",
      "key": "marketing",
      "dataPath": "campaignCode"
    }
  },
  "utmSource": {
    "type": "string",
    "x-autoStore": {
      "context": "device",
      "key": "marketing",
      "dataPath": "utmSource"
    }
  }
}
```

---

## 👤 User-Level Data (`DataContext.user`)

User seviyesindeki veriler oturum açmış kullanıcıya özgüdür. **Storage: Secure Persistent (şifreli, otomatik)**

### auth/session
Aktif oturum bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `userId` | string | Kullanıcı ID | `"u1234567890"` |
| `customerId` | string | Müşteri numarası | `"C123456789"` |
| `tokenType` | string | Token seviyesi | `"device"`, `"1fa"`, `"2fa"` |
| `sessionId` | string | Oturum ID | `"s9876543210"` |

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "user",
    "key": "auth/session",
    "dataPath": "userId"
  }
}
```

---

### profile
Kullanıcı profil bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `firstName` | string | Ad | `"Uğur"` |
| `lastName` | string | Soyad | `"Karataş"` |
| `email` | string | E-posta | `"ugur@example.com"` |
| `phone` | string | Telefon | `"+905301234567"` |
| `avatar` | string | Profil resmi URL | `"https://..."` |

**Örnek x-autoStore (Login/Profile Response Schema):**
```json
{
  "profile": {
    "type": "object",
    "x-autoStore": {
      "context": "user",
      "key": "profile"
    },
    "properties": {
      "firstName": { "type": "string" },
      "lastName": { "type": "string" },
      "email": { "type": "string" }
    }
  }
}
```

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "user",
    "key": "profile",
    "dataPath": "firstName"
  }
}
```

---

### preferences
Kullanıcı tercihleri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `theme` | string | Tema tercihi | `"dark"`, `"light"`, `"system"` |
| `language` | string | Dil tercihi | `"tr"`, `"en"` |
| `notifications` | boolean | Bildirim tercihi | `true` |

---

## 🎯 Scope-Level Data (`DataContext.scope`)

Scope seviyesindeki veriler işlem yapılan müşteri/kapsam için tutulur (backoffice senaryoları). **Storage: Secure Persistent (şifreli, otomatik)**

### customer/$ActiveScope/profile
İşlem yapılan müşterinin profili.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `customerId` | string | Müşteri numarası | `"C987654321"` |
| `firstName` | string | Müşteri adı | `"Mehmet"` |
| `lastName` | string | Müşteri soyadı | `"Yılmaz"` |
| `segment` | string | Müşteri segmenti | `"retail"`, `"corporate"` |

**Örnek x-autoStore (Customer Profile Response Schema):**
```json
{
  "customerProfile": {
    "type": "object",
    "x-autoStore": {
      "context": "scope",
      "key": "customer/$ActiveScope/profile"
    },
    "properties": {
      "customerId": { "type": "string" },
      "firstName": { "type": "string" },
      "lastName": { "type": "string" }
    }
  }
}
```

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "scope",
    "key": "customer/$ActiveScope/profile",
    "dataPath": "customerId"
  }
}
```

> **📝 Not:** `$ActiveScope` değişkeni `DataManager.getActiveScope()` ile resolve edilir. Backoffice'de müşteri seçildiğinde `DataManager.setActiveScope(customerId)` ile set edilir.

---

## 🔄 Workflow-Level Data (`DataContext.workflowInstance`)

Aktif workflow instance'ından veri çekme. **Storage: In-Memory + Cache (otomatik)**

### {domain}/{instanceId}
Aktif iş akışı verisi (dynamic key).

**Key Formatı:** `{domain}/{instanceId}` - Örnek: `"loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3"`

**Key Belirleme:**
- Key, aktif workflow instance'ının domain ve instance ID'sinden oluşur
- WorkflowManager, workflow başlatıldığında instance'ı DataManager'a `workflowInstance` context'ine kaydeder
- `x-autoBind` çalıştığında, aktif workflow instance'ının key'i otomatik olarak belirlenir
- Eğer aktif workflow yoksa, key manuel olarak belirtilmelidir

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `applicant.firstName` | string | Başvuran adı | `"Uğur"` |
| `applicant.tckn` | string | TC Kimlik No | `"12345678901"` |
| `applicationNo` | number | Başvuru numarası | `345345534534` |

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "workflowInstance",
    "key": "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3",
    "dataPath": "applicant.tckn"
  }
}
```

---

## 📝 Workflow Transition Data (`DataContext.workflowTransition`)

Aktif workflow transition form verisi. **Storage: In-Memory (geçici, otomatik)**

Workflow transition'ları (form adımları) için geçici form verisi tutulur. Her transition için ayrı key kullanılır.

### {domain}/{instanceId}/{transitionName}
Aktif workflow transition form verisi (dynamic key).

**Key Formatı:** `{domain}/{instanceId}/{transitionName}` - Örnek: `"loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term"`

**Key Belirleme:**
- Key, aktif workflow instance'ının domain, instance ID ve transition adından oluşur
- WorkflowManager, transition başlatıldığında form verisini DataManager'a `workflowTransition` context'ine kaydeder
- `x-autoBind` çalıştığında, aktif transition'ın key'i otomatik olarak belirlenir

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `term` | number | Kredi vadesi (ay) | `36` |
| `paymentPlan` | string | Ödeme planı | `"equalInstallments"` |
| `amount` | number | Kredi tutarı | `100000` |

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "context": "workflowTransition",
    "key": "loan-application/317749d0-cfff-428d-8a11-20c2d2eff9e3/set-loan-term",
    "dataPath": "term"
  }
}
```

**Örnek x-autoStore (Transition Response Schema):**
```json
{
  "term": {
    "type": "number",
    "x-autoStore": {
      "context": "workflowTransition",
      "key": "loan-application/$instanceId/set-loan-term",
      "dataPath": "term"
    }
  }
}
```

> **📝 Not:** `$instanceId` değişkeni aktif workflow instance ID'si ile otomatik replace edilir.

---

## 🎨 Artifact Data (`DataContext.artifact`)

Render içerikleri, JSON dosyaları ve UI şablonları. **Storage: Local Storage (TTL ile yönetilir)**

### views/{viewKey}
Backend'den çekilen view definition'ları (dynamic view, navigation config, vb.).

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `schema` | object | JSON Schema | `{ "type": "object", ... }` |
| `uiSchema` | object | UI Schema | `{ "ui:order": [...] }` |
| `version` | string | View versiyonu | `"1.2.0"` |

**Örnek x-autoStore (View Response Schema):**
```json
{
  "schema": {
    "type": "object",
    "x-autoStore": {
      "context": "artifact",
      "key": "views/loan-application-form",
      "ttl": 3600000
    }
  }
}
```

### navigation/{navigationKey}
Navigation config'leri (TTL ile cache'lenir).

**Örnek x-autoStore (Navigation Response Schema):**
```json
{
  "items": {
    "type": "array",
    "x-autoStore": {
      "context": "artifact",
      "key": "navigation/main-menu",
      "ttl": 86400000
    }
  }
}
```

---

## 📋 Kullanım Örnekleri

### Device Register Transition
```json
{
  "type": "object",
  "properties": {
    "deviceId": {
      "type": "string",
      "x-autoBind": {
        "context": "device",
        "key": "info",
        "dataPath": "deviceId"
      }
    },
    "installationId": {
      "type": "string",
      "x-autoBind": {
        "context": "device",
        "key": "info",
        "dataPath": "installationId"
      }
    },
    "platform": {
      "type": "string",
      "x-autoBind": {
        "context": "device",
        "key": "info",
        "dataPath": "platform"
      }
    }
  },
  "required": ["deviceId", "installationId", "platform"]
}
```

### User Action Transition
```json
{
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "x-autoBind": {
        "context": "user",
        "key": "auth/session",
        "dataPath": "userId"
      }
    },
    "sessionId": {
      "type": "string",
      "x-autoBind": {
        "context": "user",
        "key": "auth/session",
        "dataPath": "sessionId"
      }
    },
    "actionType": {
      "type": "string",
      "x-labels": {
        "tr": "İşlem Türü",
        "en": "Action Type"
      }
    }
  }
}
```

### Backoffice - Customer Action with Dynamic Variables
```json
{
  "type": "object",
  "properties": {
    "operatorId": {
      "type": "string",
      "description": "İşlemi yapan çalışan",
      "x-autoBind": {
        "context": "user",
        "key": "auth/session",
        "dataPath": "userId"
      }
    },
    "customerId": {
      "type": "string",
      "description": "İşlem yapılan müşteri",
      "x-autoBind": {
        "context": "scope",
        "key": "customer/$ActiveScope/profile",
        "dataPath": "customerId"
      }
    },
    "customerName": {
      "type": "string",
      "x-autoBind": {
        "context": "scope",
        "key": "customer/$ActiveScope/profile",
        "dataPath": "firstName"
      }
    }
  }
}
```

---

## ⚠️ Güvenlik Notları

1. **Automatic Encryption:** `DataContext.user` ve `DataContext.scope` verileri otomatik olarak şifreli tutulur.
2. **device Context Şifresiz:** `DataContext.device` şifrelenmez - bootstrap için gerekli (`deviceId`, `installationId`). Hassas veri burada tutulmamalı!
3. **secureMemory Context:** `DataContext.secureMemory` verileri **asla persist edilmez** - sadece runtime'da memory'de tutulur. Encryption key burada saklanır.
4. **User Context:** `DataContext.user` verileri sadece oturum açmış kullanıcı için erişilebilir.
5. **Scope Context:** `DataContext.scope` verileri `$ActiveScope` ile belirlenen müşteri/kapsam için geçerlidir.
6. **No UI Display:** `x-autoBind` alanları genellikle form'da gösterilmez, arka planda otomatik doldurulur.
7. **Backend Validation:** AutoBind verileri backend tarafında mutlaka doğrulanmalıdır - client tarafı güvenilir kaynak değildir.
8. **Dynamic Variables:** `$ActiveUser` ve `$ActiveScope` değişkenleri runtime'da SDK tarafından resolve edilir (`DataManager.getActiveUser()` ve `DataManager.getActiveScope()`).
9. **App Restart:** App kapanınca `secureMemory` silinir → Tekrar açılınca Device Register gerekir → Encryption key yeniden alınır.

---

## ⚠️ Error Handling ve Fallback

### Veri Bulunamadığında

Eğer `x-autoBind` edilecek veri bulunamazsa:

| Durum | Davranış | Örnek |
|-------|----------|-------|
| **Key yok** | `undefined` döner, field boş kalır | `user/auth/session` yoksa (logout olmuş) |
| **dataPath yok** | `undefined` döner, field boş kalır | `applicant.firstName` yoksa |
| **Context yok** | `undefined` döner, field boş kalır | `scope` context set edilmemişse |
| **Dynamic variable resolve edilemez** | Hata fırlatılır | `$ActiveScope` set edilmemişse |

**Örnek Senaryolar:**
- **Logout durumu:** `user/auth/session` yoksa → `userId` autoBind edilemez → field boş kalır
- **Scope set edilmemiş:** `scope/customer/$ActiveScope/profile` yoksa → `customerId` autoBind edilemez → field boş kalır
- **Workflow instance yok:** `workflowInstance` key'i bulunamazsa → `applicant.tckn` autoBind edilemez → field boş kalır

### Type Safety ve Validation

- **Type Coercion:** SDK, `dataPath`'ten gelen değeri schema'daki beklenen tipe göre otomatik dönüştürmeye çalışır (string → number, vb.)
- **Type Mismatch:** Eğer tip uyuşmazlığı varsa, SDK uyarı log'lar ama hata fırlatmaz - field boş kalır
- **Null/Undefined Handling:** `null` veya `undefined` değerler field'ı boş bırakır, hata oluşturmaz
- **Backend Validation:** Client-side type kontrolü yeterli değildir - backend mutlaka validate etmelidir

### Çakışma Durumları

**`user/auth/session.customerId` vs `scope/customer/$ActiveScope/profile.customerId`:**

| Context | Kullanım | Senaryo |
|---------|----------|---------|
| `user/auth/session.customerId` | Kullanıcının kendi müşteri ID'si | Retail müşteri kendi işlemlerini yaparken |
| `scope/customer/$ActiveScope/profile.customerId` | İşlem yapılan müşteri ID'si | Backoffice çalışan başka müşteri için işlem yaparken |

**Öncelik:** İkisi farklı senaryolar için kullanılır, çakışma olmaz. Backend, hangi customerId'nin kullanılacağını belirler.
