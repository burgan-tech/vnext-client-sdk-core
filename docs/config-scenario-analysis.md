# Config vs Senaryo Uyumluluk Analizi

## ✅ Uyumlu Olanlar

### 1. Basic Test - Cold Start
- ✅ **Device Register**: `initialization[400]` → `device-register` workflow
- ✅ **Device Auth**: `initialization[500]` → `device-auth` workflow  
- ✅ **Device Dashboard**: `dashboards.device` tanımlı
- ✅ **API Endpoint**: `api.baseUrl` var

### 2. Basic Test - 1FA Login
- ✅ **1FA Flow**: `auth.flows.1fa` → `login-1fa` workflow
- ✅ **Upgrade Flow**: `auth.flows.upgrade.deviceTo1fa` var
- ✅ **1FA Dashboard**: `dashboards.1fa` tanımlı

### 3. Basic Test - Warm Start
- ✅ **Token Refresh**: `auth.tokenRefresh` endpoint var
- ✅ **Token Strategy**: `rotating` tanımlı
- ✅ **1FA Dashboard**: Restore sonrası gösterilecek dashboard var

### 4. Deep Link Senaryoları
- ✅ **Deep Linking**: `features.deepLinking` enabled, scheme/domains tanımlı
- ✅ **1FA Flow**: Login için workflow var
- ✅ **2FA Flow**: Upgrade için workflow var
- ✅ **Upgrade Flows**: `deviceTo1fa` ve `1faTo2fa` tanımlı

### 5. Realtime Communication
- ✅ **WebSocket**: `realtime.websocket` enabled
- ✅ **MQTT**: `realtime.mqtt` enabled
- ✅ **Reconnect**: Her ikisi için reconnect config var

---

## ⚠️ Eksik/Revize Edilecekler

### 1. Step-Up Otomatik Başlatma
**Senaryo:** Deep link'te 403 `step_up_required` → SDK otomatik upgrade başlatır

**Config Durumu:**
- ❌ Config'de step-up otomatik başlatma bilgisi yok
- ✅ Workflow ID'leri var (`auth.flows.upgrade.*`)
- ⚠️ **Çözüm:** SDK, 403 response'dan `authorization_flow` alıp otomatik başlatacak (config'de olmasına gerek yok)

### 2. Dashboard Eşleştirmesi
**Senaryo:** Token tipine göre dashboard gösterilir (device → device-dashboard, 1FA → 1fa-dashboard)

**Config Durumu:**
- ⚠️ `dashboards` static tanımlı (1fa/2fa hardcoded)
- ⚠️ `_comment` ile revize notu var
- ⚠️ **Sorun:** OAuth2'de 1fa/2fa yok, token claim'lerine göre dinamik olmalı

**Öneri:**
```json
"dashboards": {
  "mapping": "token.claims.dashboard_id",  // Backend token'da gönderir
  "fallback": "device-dashboard"
}
```

### 3. Navigation Endpoint
**Senaryo:** Navigation backend'den gelir (user, scope, subject'e göre)

**Config Durumu:**
- ✅ `navigation.endpoint` var (`/client/navigation`)
- ✅ Backend-driven yaklaşım doğru

### 4. DataManager Test Senaryoları
**Senaryo:** State persistence, scope management, data binding, etc.

**Config Durumu:**
- ❌ DataManager için config yok
- ✅ **Doğru:** DataManager SDK default davranışları kullanır (secure storage, encryption, etc.)
- ✅ Config'de olmasına gerek yok (best practice olarak zaten secure)

### 5. Workflow Başlatma (Kullanıcı Tetiklemeli)
**Senaryo:** Şifre değiştirme, kullanıcı kayıt, password reset → Navigation'dan gelir

**Config Durumu:**
- ✅ Config'de yok (doğru!)
- ✅ Navigation endpoint'ten gelecek

### 6. Localization
**Senaryo:** Tüm içerik backend'den lokalize gelir

**Config Durumu:**
- ⚠️ `localization` config var ama gereksiz
- ⚠️ `_comment` ile revize notu var
- ⚠️ **Sorun:** Accept-Language header ile çözülmeli, ayrı endpoint'e gerek yok

---

## 🔴 Kritik Eksikler

### 1. Config Endpoint'i Yok!
**Sorun:** Senaryolarda "config çek" diyor ama config'in nereden çekileceği yok!

**Çözüm:**
```json
{
  "config": {
    "endpoint": "/client/config",
    "cache": true,
    "refreshInterval": 3600000
  }
}
```

### 2. Lifecycle Event Handling
**Sorun:** Cold start, warm start, deeplink_received gibi lifecycle event'ler config'de tanımlı değil

**Çözüm:** Bu SDK'nın kendi davranışı, config'de olmasına gerek yok (lifecycle.md'de dokümante)

### 3. Error Handling - 403 Step-Up
**Sorun:** 403 `step_up_required` response formatı ve otomatik başlatma config'de yok

**Çözüm:** SDK otomatik handle edecek, config'de olmasına gerek yok (authantication.md'de dokümante)

---

## 📊 Özet

| Kategori | Durum | Açıklama |
|----------|-------|----------|
| **Auth Flows** | ✅ Uyumlu | Workflow ID'leri tanımlı |
| **Dashboards** | ⚠️ Revize Gerekli | 1fa/2fa hardcoded, dinamik olmalı |
| **Initialization** | ✅ Uyumlu | Device register/auth sıralı |
| **Deep Linking** | ✅ Uyumlu | Feature enabled, scheme tanımlı |
| **Navigation** | ✅ Uyumlu | Backend-driven endpoint var |
| **Realtime** | ✅ Uyumlu | WebSocket + MQTT enabled |
| **DataManager** | ✅ Uyumlu | Config gereksiz (SDK default) |
| **Config Endpoint** | 🔴 Eksik | Config'in nereden çekileceği yok! |
| **Localization** | ⚠️ Revize Gerekli | Accept-Language ile çözülmeli |

---

## 🎯 Öneriler

1. **Config endpoint ekle:**
   ```json
   "config": {
     "endpoint": "/client/config"
   }
   ```

2. **Dashboard mapping'i dinamikleştir:**
   - Token claim'lerine göre eşleştirme
   - Backend token'da `dashboard_id` göndersin

3. **Localization config'i kaldır:**
   - Accept-Language header kullan
   - Backend tüm response'ları lokalize döner

4. **Step-up mekanizması:**
   - Config'de olmasına gerek yok
   - SDK otomatik handle edecek (authantication.md'de dokümante)

---

## ✅ Sonuç

**Genel Uyumluluk: %85**

- ✅ Temel akışlar (auth, initialization, deep link) uyumlu
- ⚠️ Dashboard ve localization revize edilecek (notlar alındı)
- 🔴 Config endpoint eksik (kritik!)

**Aksiyonlar:**
1. Config endpoint ekle
2. Dashboard mapping'i revize et (ileride)
3. Localization config'i kaldır (ileride)
