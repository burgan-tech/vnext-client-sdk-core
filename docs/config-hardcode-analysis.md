# Config Hardcode Analizi - Senaryo Uyumluluğu

## ⚠️ ÖNEMLİ: Config Dinamik Oluşturuluyor!

**Config dosyası static değil!** Her request'te backend tarafından dinamik olarak oluşturuluyor:
- **Token sahibine göre** → Kullanıcı bazlı özelleştirme
- **Uygulamaya göre** → App-specific config
- **Cihaza göre** → Device-specific config

Bu durumda config'deki tüm değerler aslında **backend tarafından dinamik render edilmiş** özel config'lerdir. Hardcode değil!

## 🔍 Senaryo vs Config Karşılaştırması

### ⚠️ Senaryo-Config Tutarsızlıkları

#### 1. **Basic Test - Token Upgrade Akışı**
**Senaryo:** "Device token → 1FA token upgrade edilir"
**Gerçek:** Device token'dan direkt 2FA login akışına gidilir, login sonucunda hem 1FA hem 2FA token verilir
**Config:** ✅ Doğru - Transitions yok, backend'den gelir

**Sorun:** Senaryo dokümantasyonu güncel değil!

#### 2. **Deep Link Senaryo 1 - Login Workflow**
**Senaryo:** `authorization_flow: "morph-idm:workflow:login-1fa"`
**Gerçek:** Tek login akışı var (login-2fa), sonucunda 1FA ve 2FA token verilir
**Config:** ✅ Doğru - Login workflow config'de yok, backend response'dan gelir

**Sorun:** Senaryo dokümantasyonu güncel değil!

#### 3. **Deep Link Senaryo 2 - Upgrade Workflow**
**Senaryo:** "2FA upgrade workflow'unu başlatır"
**Gerçek:** 1FA'dan 2FA'ya geçiş için tekrar login gerekir (grant flow değil, full login)
**Config:** ✅ Doğru - Transitions yok, backend'den gelir

---

## ✅ Config Dinamik Oluşturuluyor - Hardcode Yok!

### 1. Auth Provider Konfigürasyonları (Dinamik ✅)
```json
"authProviders": {
  "morph-idm-device": { ... },  // ✅ Backend dinamik oluşturuyor
  "morph-idm-1fa": { ... },     // ✅ Kullanıcı/cihaz bazlı
  "morph-idm-2fa": { ... }      // ✅ Dinamik render
}
```

**Durum:**
- ✅ Her request'te backend token sahibine, uygulamaya, cihaza göre config oluşturuyor
- ✅ Provider ve token konfigürasyonları (expiry, storage, grantFlow) dinamik
- ✅ Yeni provider eklemek için backend config'i günceller, kod değişmez

**Değerlendirme:** ✅ **Tamamen backend-driven** - Her request'te dinamik oluşturuluyor

### 2. Homepage ID'leri (Dinamik ✅)

Homepage bilgisi artık token seviyelerine göre değil, backend response'larından dinamik belirleniyor.

**Durum:**
- ✅ Homepage ID'leri backend tarafından dinamik belirleniyor
- ✅ Token sahibine, uygulamaya göre değişebilir
- ✅ Homepage detayları (view, navigation) backend'den gelir

**Değerlendirme:** ✅ **Tamamen backend-driven** - Dinamik oluşturuluyor

### 3. Workflow ID'leri (Backend-Driven ✅)
```json
// Config'de yok - Backend response'dan gelir
{
  "error": "step_up_required",
  "step_up": {
    "authorization_flow": "morph-idm:workflow:login-2fa"  // ✅ Backend'den
  }
}
```

**Değerlendirme:** ✅ **Tamamen backend-driven**

### 4. Initialization Workflow'ları (Dinamik ✅)
```json
"initialization": [
  {
    "order": 400,
    "type": "workflow",
    "config": {
      "workflow": "morph-idm:workflow:device-register"  // ✅ Backend dinamik belirliyor
    }
  }
]
```

**Durum:**
- ✅ Device register/auth workflow ID'leri backend tarafından dinamik belirleniyor
- ✅ Uygulamaya, cihaza göre değişebilir
- ✅ Her request'te backend'e göre farklı workflow'lar olabilir

**Değerlendirme:** ✅ **Tamamen backend-driven** - Dinamik oluşturuluyor

### 5. Deep Linking (Dinamik ✅)
```json
"deepLinking": {
  "incoming": {
    "schemes": ["myapp", "myapp-dev"],
    "domains": ["*.example.com"]
  },
  "outgoing": {
    "schemes": ["tel", "mailto"],
    "domains": ["*.trusted.com"]
  }
}
```

**Durum:**
- ✅ Deep linking whitelist'leri backend tarafından dinamik belirleniyor
- ✅ Token sahibine, uygulamaya, cihaza göre değişebilir
- ✅ Her request'te farklı incoming/outgoing kuralları olabilir

**Değerlendirme:** ✅ **Tamamen backend-driven** - Dinamik oluşturuluyor

---

## ✅ Backend-Driven Olanlar

1. **Token Type ID'leri** → Token claim'inden (`token_type`)
2. **Workflow ID'leri** → 403 response'dan (`authorization_flow`)
3. **Navigation** → `/client/navigation` endpoint'inden
4. **Views** → Navigation veya token claim'inden
5. **Dashboard/Homepage Detayları** → Backend'den
6. **Step-up Akışları** → 403 response'dan

---

## ✅ Config Dinamik Oluşturulduğu İçin Sorun Yok!

### Config Request Akışı:
```
1. SDK → GET /client/config
   Headers: Authorization: Bearer <token>
   Body: { deviceId, installationId, appId, ... }

2. Backend → Config oluşturur:
   - Token sahibine göre (user, role, permissions)
   - Uygulamaya göre (app-specific features)
   - Cihaza göre (device type, platform)
   
3. Backend → Dinamik config döner:
   {
     "initialization": [...],
     "deepLinking": {
       "incoming": { "schemes": [...], "domains": [...] },
       "outgoing": { "schemes": [...], "domains": [...] }
     },
     "router": {
       "defaultMode": "mdi",
       "allowChangeMode": true
     }
   }
```

**Sonuç:** ✅ **Hiçbir hardcode yok!** Her şey backend tarafından dinamik oluşturuluyor.

---

## 📊 Senaryo Uyumluluk Tablosu

| Senaryo | Config Durumu | Hardcode? | Backend-Driven? |
|---------|---------------|-----------|-----------------|
| **Basic Test - Device Auth** | ✅ Uyumlu | ✅ Yok | ✅ Dinamik oluşturuluyor |
| **Basic Test - Login** | ⚠️ Senaryo güncel değil | ✅ Yok | ✅ Backend'den gelir |
| **Basic Test - Homepage** | ✅ Uyumlu | ✅ Yok | ✅ Dinamik oluşturuluyor |
| **Deep Link - Step-up** | ✅ Uyumlu | ✅ Yok | ✅ Backend response'dan |
| **Deep Link - Workflow** | ✅ Uyumlu | ✅ Yok | ✅ Backend response'dan |
| **DataManager** | ✅ Uyumlu | ✅ Yok | ✅ SDK default davranış |

---

## 🎯 Sonuç ve Öneriler

### ✅ Genel Durum: %100 Backend-Driven!

**Config Dinamik Oluşturuluyor:**
1. ✅ Auth provider konfigürasyonları → Backend dinamik belirliyor (token sahibine göre)
2. ✅ Initialization workflow ID'leri → Backend dinamik belirliyor (uygulamaya göre)
3. ✅ Deep linking kuralları → Backend dinamik belirliyor (cihaza göre)
4. ✅ Homepage ID'leri → Backend dinamik belirliyor (kullanıcı bazlı)

**Hardcode Yok!** Her şey backend tarafından her request'te dinamik oluşturuluyor.

### Öneriler:

1. **Senaryo dokümantasyonunu güncelle:**
   - "1FA authentication akışı" → "Login akışı (2FA, sonucunda 1FA ve 2FA token)"
   - "Device → 1FA upgrade" → "Device → 2FA login"

2. **Config request dokümantasyonu ekle:**
   - Config endpoint'inin nasıl çağrıldığı
   - Hangi parametrelerin gönderildiği (deviceId, installationId, appId, etc.)
   - Backend'in nasıl dinamik config oluşturduğu

---

## ✅ Final Değerlendirme

**Hardcode Olmadan İlerleyebilir miyiz?**
- ✅ **Evet, %100!**
- ✅ Config her request'te dinamik oluşturuluyor
- ✅ Token sahibine, uygulamaya, cihaza göre özelleştiriliyor
- ✅ Hiçbir hardcode yok!

**Kritik Eksikler:**
- ⚠️ Senaryo dokümantasyonu güncel değil (1FA login → 2FA login)
- ✅ Config dinamik oluşturma süreci dokümante edilmeli
