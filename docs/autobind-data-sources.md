# AutoBind Data Sources

`x-autoBind` property'si için kullanılabilecek client-side veri kaynaklarının dokümantasyonu. Bu veriler client SDK tarafından yönetilir ve transition schema'larında otomatik olarak doldurulabilir.

---

## 📱 Device-Level Data

Device seviyesindeki veriler tüm kullanıcılar için ortaktır ve cihaza özgüdür.

### device/info
Cihaz tanımlama bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `deviceId` | string | Unique cihaz tanımlayıcısı | `"d8a7b6c5-4e3f-2a1b-9c8d-7e6f5a4b3c2d"` |
| `installationId` | string | Uygulama kurulum tanımlayıcısı | `"i1a2b3c4-5d6e-7f8g-9h0i-j1k2l3m4n5o6"` |
| `platform` | string | Platform türü | `"web"`, `"ios"`, `"android"` |
| `osVersion` | string | İşletim sistemi versiyonu | `"14.0"`, `"Windows 11"` |
| `appVersion` | string | Uygulama versiyonu | `"1.2.3"` |

**Scope:** `persistentOnLocal`  
**Context:** `device`

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "scope": "persistentOnLocal",
    "context": "device",
    "key": "device/info",
    "dataPath": "deviceId"
  }
}
```

---

### device/capabilities
Cihaz yetenekleri ve özellikleri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `biometricAvailable` | boolean | Biyometrik doğrulama desteği | `true` |
| `biometricType` | string | Biyometrik türü | `"fingerprint"`, `"faceId"`, `"none"` |
| `pushEnabled` | boolean | Push notification izni | `true` |
| `cameraAvailable` | boolean | Kamera erişimi | `true` |
| `locationAvailable` | boolean | Konum erişimi | `true` |

**Scope:** `inMemory`  
**Context:** `device`

---

### device/network
Ağ durumu bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `isOnline` | boolean | İnternet bağlantısı durumu | `true` |
| `connectionType` | string | Bağlantı türü | `"wifi"`, `"cellular"`, `"ethernet"` |
| `effectiveType` | string | Efektif bağlantı hızı | `"4g"`, `"3g"`, `"slow-2g"` |

**Scope:** `inMemory`  
**Context:** `device`

---

### device/locale
Cihaz dil ve bölge ayarları.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `language` | string | Sistem dili (ISO 639-1) | `"tr"`, `"en"` |
| `region` | string | Bölge kodu (ISO 3166-1) | `"TR"`, `"US"` |
| `timezone` | string | Zaman dilimi | `"Europe/Istanbul"` |
| `locale` | string | Tam locale | `"tr-TR"`, `"en-US"` |

**Scope:** `inMemory`  
**Context:** `device`

---

## 👤 User-Level Data

User seviyesindeki veriler oturum açmış kullanıcıya özgüdür ve şifrelenmiş olarak saklanır.

### auth/session
Aktif oturum bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `userId` | string | Kullanıcı ID | `"u1234567890"` |
| `customerId` | string | Müşteri numarası | `"C123456789"` |
| `tokenType` | string | Token seviyesi | `"device"`, `"1fa"`, `"2fa"` |
| `sessionId` | string | Oturum ID | `"s9876543210"` |

**Scope:** `persistentOnSecure`  
**Context:** `user`

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "scope": "persistentOnSecure",
    "context": "user",
    "key": "auth/session",
    "dataPath": "userId"
  }
}
```

---

### user/profile
Kullanıcı profil bilgileri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `firstName` | string | Ad | `"Uğur"` |
| `lastName` | string | Soyad | `"Karataş"` |
| `email` | string | E-posta | `"ugur@example.com"` |
| `phone` | string | Telefon | `"+905301234567"` |
| `avatar` | string | Profil resmi URL | `"https://..."` |

**Scope:** `persistentOnSecure`  
**Context:** `user`

---

### user/preferences
Kullanıcı tercihleri.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `theme` | string | Tema tercihi | `"dark"`, `"light"`, `"system"` |
| `language` | string | Dil tercihi | `"tr"`, `"en"` |
| `notifications` | boolean | Bildirim tercihi | `true` |

**Scope:** `persistentOnSecure`  
**Context:** `user`

---

## 🔄 Workflow-Level Data

Aktif workflow instance'ından veri çekme.

### workflowInstance (dynamic key)
Aktif iş akışı verisi.

| dataPath | Tip | Açıklama | Örnek |
|----------|-----|----------|-------|
| `applicant.firstName` | string | Başvuran adı | `"Uğur"` |
| `applicant.tckn` | string | TC Kimlik No | `"12345678901"` |
| `applicationNo` | number | Başvuru numarası | `345345534534` |

**Scope:** `workflowInstance`  
**Context:** `user`  
**Key:** `{domain}/{instanceId}` (dynamic)

**Örnek x-autoBind:**
```json
{
  "x-autoBind": {
    "scope": "workflowInstance",
    "context": "user",
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
        "scope": "persistentOnLocal",
        "context": "device",
        "key": "device/info",
        "dataPath": "deviceId"
      }
    },
    "installationId": {
      "type": "string",
      "x-autoBind": {
        "scope": "persistentOnLocal",
        "context": "device",
        "key": "device/info",
        "dataPath": "installationId"
      }
    },
    "platform": {
      "type": "string",
      "x-autoBind": {
        "scope": "persistentOnLocal",
        "context": "device",
        "key": "device/info",
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
        "scope": "persistentOnSecure",
        "context": "user",
        "key": "auth/session",
        "dataPath": "userId"
      }
    },
    "sessionId": {
      "type": "string",
      "x-autoBind": {
        "scope": "persistentOnSecure",
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

---

## ⚠️ Güvenlik Notları

1. **Sensitive Data:** `persistentOnSecure` scope'undaki veriler encrypted storage'da tutulur.
2. **User Context:** `DataContext.user` verileri sadece oturum açmış kullanıcı için erişilebilir.
3. **No UI Display:** `x-autoBind` alanları genellikle form'da gösterilmez, arka planda otomatik doldurulur.
4. **Backend Validation:** AutoBind verileri backend tarafında mutlaka doğrulanmalıdır.
