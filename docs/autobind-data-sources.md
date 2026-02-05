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

| Değişken | Açıklama | Örnek Değer |
|----------|----------|-------------|
| `$ActiveUser` | Login olmuş kullanıcı (çalışan, temsilci) | `"employee123"` |
| `$ActiveScope` | İşlem yapılan müşteri/kapsam | `"C987654321"` |

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

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `deviceId` | string | Unique cihaz tanımlayıcısı | `"d8a7b6c5-4e3f-2a1b-9c8d-7e6f5a4b3c2d"` |
| `installationId` | string | Uygulama kurulum tanımlayıcısı | `"i1a2b3c4-5d6e-7f8g-9h0i-j1k2l3m4n5o6"` |
| `platform` | string | Platform türü | `"web"`, `"ios"`, `"android"` |
| `osVersion` | string | İşletim sistemi versiyonu | `"14.0"`, `"Windows 11"` |
| `appVersion` | string | Uygulama versiyonu | `"1.2.3"` |

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

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `biometricAvailable` | boolean | Biyometrik doğrulama desteği | `true` |
| `biometricType` | string | Biyometrik türü | `"fingerprint"`, `"faceId"`, `"none"` |
| `pushEnabled` | boolean | Push notification izni | `true` |
| `cameraAvailable` | boolean | Kamera erişimi | `true` |
| `locationAvailable` | boolean | Konum erişimi | `true` |

---

### network
Ağ durumu bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `isOnline` | boolean | İnternet bağlantısı durumu | `true` |
| `connectionType` | string | Bağlantı türü | `"wifi"`, `"cellular"`, `"ethernet"` |
| `effectiveType` | string | Efektif bağlantı hızı | `"4g"`, `"3g"`, `"slow-2g"` |

---

### locale
Cihaz dil ve bölge ayarları.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `language` | string | Sistem dili (ISO 639-1) | `"tr"`, `"en"` |
| `region` | string | Bölge kodu (ISO 3166-1) | `"TR"`, `"US"` |
| `timezone` | string | Zaman dilimi | `"Europe/Istanbul"` |
| `locale` | string | Tam locale | `"tr-TR"`, `"en-US"` |

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

---

## 🔄 Workflow-Level Data (`DataContext.workflowInstance`)

Aktif workflow instance'ından veri çekme. **Storage: In-Memory + Cache (otomatik)**

### {domain}/{instanceId}
Aktif iş akışı verisi (dynamic key).

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
8. **Dynamic Variables:** `$ActiveUser` ve `$ActiveScope` değişkenleri runtime'da SDK tarafından resolve edilir.
9. **App Restart:** App kapanınca `secureMemory` silinir → Tekrar açılınca Device Register gerekir → Encryption key yeniden alınır.
