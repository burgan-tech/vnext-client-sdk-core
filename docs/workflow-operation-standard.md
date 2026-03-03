# Workflow Operasyon Standardı

## Genel Bakış

Backend API'de workflow'lar üzerinde iki temel operasyon yapılabilir: **başlatma** (start) ve **ilerleme** (transition). Bu dokümantasyon, tüm workflow operasyonlarının tek bir standart descriptor yapısı ile tanımlanmasını sağlar.

SDK, descriptor'daki `key` ve `transition` alanlarının varlığına bakarak hangi operasyonu yapacağını belirler.

## Swagger API Endpoint'leri

```
POST  /api/{runtime}/{domain}/workflows/{workflow}/instances/start
PATCH /api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/transitions/{transition}
```

## Descriptor Yapısı

```json
{
  "runtime": "v2",
  "domain": "morph-idm",
  "workflow": "device-register",
  "key": "instance-id",
  "transition": "approve",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Alanlar

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `runtime` | `string` | Evet | API runtime versiyonu (ör. `"v2"`) |
| `domain` | `string` | Evet | Domain tanımlayıcı (ör. `"morph-idm"`, `"discovery"`) |
| `workflow` | `string` | Evet | Workflow adı |
| `key` | `string` | Hayır | Instance ID. Yoksa yeni instance başlatılır, varsa mevcut instance üzerinde çalışılır. |
| `transition` | `string` | Hayır | Transition key. `key` varsa hangi geçişin çalıştırılacağını belirtir. |
| `requiredToken` | `array` | Evet | Operasyon için gerekli token listesi |

### `requiredToken` Yapısı

Fonksiyon çağrısı standardı ile aynı yapıdadır. Bkz: [Fonksiyon Çağrısı Standardı](./function-call-standard.md)

```json
{ "provider": "morph-idm-1fa", "token": "access" }
```

---

## Operasyon Belirleme Mantığı

SDK, `key` ve `transition` alanlarının varlığına göre operasyonu belirler:

| `key` | `transition` | Operasyon | Açıklama |
|-------|-------------|-----------|----------|
| yok | yok | **Start** | Yeni workflow instance başlatılır |
| var | yok | **Continue** | Instance durumu alınır, mevcut transition'lar değerlendirilir |
| var | var | **Transition** | Belirtilen transition doğrudan çalıştırılır |

---

## Operasyon 1: Start (Yeni Instance Başlatma)

`key` alanı yoksa SDK yeni bir workflow instance'ı başlatır.

### URL Şablonu

```
POST {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/start
```

### Örnek Descriptor

```json
{
  "runtime": "v2",
  "domain": "morph-idm",
  "workflow": "device-register",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
POST https://api.burgan.com.tr/api/v2/morph-idm/workflows/device-register/instances/start
```

### Kullanım Alanları

- Auth provider `grantFlow` (device-login, mobile-login)
- Stage selection workflow (`selector-workflow`)
- Initialization adımlarında yeni workflow başlatma

---

## Operasyon 2: Transition (Mevcut Instance İlerleme)

`key` alanı varsa SDK mevcut bir instance üzerinde çalışır. `transition` belirtilmişse doğrudan o geçiş çalıştırılır.

### URL Şablonu

```
PATCH {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/transitions/{transition}
```

### Örnek Descriptor

```json
{
  "runtime": "v2",
  "domain": "morph-idm",
  "workflow": "device-register",
  "key": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "transition": "approve",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
PATCH https://api.burgan.com.tr/api/v2/morph-idm/workflows/device-register/instances/a1b2c3d4-5678-90ab-cdef-1234567890ab/transitions/approve
```

### Kullanım Alanları

- Backend'den gelen "bu instance'ı ilerlet" komutları
- Çok adımlı workflow'larda belirli bir transition'ı tetikleme
- Deep link ile gelen workflow devam ettirme senaryoları

---

## Operasyon 3: Continue (Instance Durumu Alma)

`key` var ama `transition` yoksa, SDK önce instance durumunu alır ve mevcut transition'ları değerlendirir.

### URL Şablonu

```
GET {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}
```

### Örnek Descriptor

```json
{
  "runtime": "v2",
  "domain": "morph-idm",
  "workflow": "device-register",
  "key": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
GET https://api.burgan.com.tr/api/v2/morph-idm/workflows/device-register/instances/a1b2c3d4-5678-90ab-cdef-1234567890ab
```

### Kullanım Alanları

- Yarım kalmış bir workflow'u kaldığı yerden devam ettirme
- Instance'ın mevcut durumunu ve kullanılabilir transition'ları öğrenme

---

## URL Oluşturma Kuralları

SDK, descriptor'daki alanlara göre URL'i şu şekilde oluşturur:

```
Start (key yok):
  POST {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/start

Transition (key + transition var):
  PATCH {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/transitions/{transition}

Continue (key var, transition yok):
  GET {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}
```

- `baseUrl`: Aktif stage'in `baseUrl` değerinden alınır
- `runtime`: Descriptor'daki `runtime` alanı
- HTTP method operasyona göre değişir: Start → POST, Transition → PATCH, Continue → GET

## Token Çözümleme Akışı

[Fonksiyon Çağrısı Standardı](./function-call-standard.md) ile aynı mekanizma kullanılır:

1. `requiredToken` listesi okunur
2. İlk geçerli token bulunur (öncelik sırasına göre)
3. Eksik token varsa ilgili provider'ın `grantFlow`'u tetiklenir
4. Token sağlandıktan sonra operasyon çalıştırılır

## Mevcut Yapılarla İlişki

### grantFlow

Auth provider'lardaki `grantFlow` bu standardın **Start** operasyonuna karşılık gelir:

```json
"grantFlow": {
  "runtime": "v2",
  "domain": "morph-idm",
  "workflow": "mobile-login",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

`key` ve `transition` yok → her zaman yeni instance başlatılır.

### selector-workflow

Environment config'deki `selector-workflow` da aynı yapıdadır:

```json
"selector-workflow": {
  "runtime": "v2",
  "domain": "discovery",
  "workflow": "enviroment-selector",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### initialization Adımları

Client config'deki `initialization` array'inde workflow tipindeki adımlar bu standardı kullanır:

```json
{
  "order": 400,
  "type": "workflow",
  "execution": { "timeout": 30000, "onError": "break" },
  "config": {
    "runtime": "v2",
    "domain": "morph-idm",
    "workflow": "device-register",
    "requiredToken": [
      { "provider": "morph-idm-1fa", "token": "access" },
      { "provider": "morph-idm-device", "token": "access" }
    ]
  }
}
```

`config` bloğu doğrudan bir workflow operasyon descriptor'dır. `key` yoksa start, varsa continue/transition.

## Fonksiyon Çağrısı Standardı ile Karşılaştırma

| | Fonksiyon Çağrısı | Workflow Operasyon |
|-|--------------------|--------------------|
| Amaç | Veri sorgulama | İş akışı yürütme |
| HTTP Method | GET | POST / PATCH / GET |
| Ayırt edici alan | `type` (zorunlu) | `key` + `transition` (opsiyonel) |
| Swagger tag | Function | Instance |
| Stateless | Evet | Hayır (instance state var) |

## Validasyon Kuralları

| Durum | Zorunlu Alanlar |
|-------|----------------|
| Start | `runtime`, `domain`, `workflow`, `requiredToken` |
| Transition | `runtime`, `domain`, `workflow`, `key`, `transition`, `requiredToken` |
| Continue | `runtime`, `domain`, `workflow`, `key`, `requiredToken` |

`transition` alanı `key` olmadan verilemez. `key` olmadan `transition` verilirse SDK hata fırlatır.
