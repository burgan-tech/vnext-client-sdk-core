# Fonksiyon Çağrısı Standardı

## Genel Bakış

Backend API'de üç seviyede fonksiyon çağrısı yapılabilir: **domain**, **workflow** ve **instance**. Bu dokümantasyon, tüm servis çağrılarının tek bir standart yapı ile tanımlanmasını sağlayan endpoint descriptor formatını tanımlar.

SDK tarafında tek bir `resolveEndpointUrl(descriptor)` fonksiyonu, descriptor'daki `type` alanına bakarak doğru URL'i oluşturur.

## Swagger API Hiyerarşisi

Backend Swagger'da fonksiyon endpoint'leri üç seviyede tanımlıdır:

```
/api/v1/{domain}/functions/{function}
/api/v1/{domain}/workflows/{workflow}/functions/{function}
/api/v1/{domain}/workflows/{workflow}/instances/{instance}/functions/{function}
```

Bu üç seviye, endpoint descriptor'daki `type` alanı ile birebir eşleşir:

| type | Swagger Pattern | Açıklama |
|------|----------------|----------|
| `domain-function` | `/api/{runtime}/{domain}/functions/{function}` | Domain seviyesinde fonksiyon |
| `workflow-function` | `/api/{runtime}/{domain}/workflows/{workflow}/functions/{function}` | Workflow seviyesinde fonksiyon |
| `instance-function` | `/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/functions/{function}` | Instance seviyesinde fonksiyon |

## Endpoint Descriptor Yapısı

Her endpoint descriptor aşağıdaki ortak ve tipe özel alanlardan oluşur:

### Ortak Alanlar

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `type` | `string` | Evet | `"domain-function"`, `"workflow-function"` veya `"instance-function"` |
| `runtime` | `string` | Evet | API runtime versiyonu (ör. `"v2"`) |
| `domain` | `string` | Evet | Domain tanımlayıcı (ör. `"discovery"`, `"morph-idm"`) |
| `function` | `string` | Evet | Çağrılacak fonksiyon adı |
| `requiredToken` | `array` | Evet | Çağrı için gerekli token listesi |

### Tipe Özel Alanlar

| Alan | Tip | Geçerli Tipler | Açıklama |
|------|-----|----------------|----------|
| `workflow` | `string` | `workflow-function`, `instance-function` | Workflow tanımlayıcı |
| `key` | `string` | `instance-function` | Instance tanımlayıcı (instance key) |

### `requiredToken` Yapısı

Her eleman, çağrının yapılabilmesi için hangi provider'dan hangi token tipinin gerekli olduğunu belirtir:

```json
{
  "provider": "morph-idm-1fa",
  "token": "access"
}
```

| Alan | Tip | Açıklama |
|------|-----|----------|
| `provider` | `string` | Auth provider key'i (`authProviders[].key` ile eşleşir) |
| `token` | `string` | Token tipi (ör. `"access"`, `"refresh"`) |

SDK, çağrı yapmadan önce `requiredToken` listesindeki tüm token'ların mevcut ve geçerli olduğunu doğrular. Eksik veya süresi dolmuş token varsa, ilgili auth provider'ın `grantFlow`'u tetiklenir.

---

## Tip 1: `domain-function`

Domain seviyesinde bir fonksiyon çağrısı. Workflow veya instance bağlamı yoktur.

### URL Şablonu

```
{baseUrl}/api/{runtime}/{domain}/functions/{function}
```

### Zorunlu Alanlar

`type`, `runtime`, `domain`, `function`, `requiredToken`

### Örnek

```json
{
  "type": "domain-function",
  "runtime": "v2",
  "domain": "discovery",
  "function": "domain-info",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
https://api.burgan.com.tr/api/v2/discovery/functions/domain-info
```

### Kullanım Alanı

Domain hakkında genel bilgi almak, domain seviyesinde konfigürasyon sorgulamak gibi workflow'a bağlı olmayan işlemler.

---

## Tip 2: `workflow-function`

Belirli bir workflow üzerinde fonksiyon çağrısı. Instance bağlamı yoktur.

### URL Şablonu

```
{baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/functions/{function}
```

### Zorunlu Alanlar

`type`, `runtime`, `domain`, `workflow`, `function`, `requiredToken`

### Örnek

```json
{
  "type": "workflow-function",
  "runtime": "v2",
  "domain": "discovery",
  "workflow": "enviroment",
  "function": "available-enviroments",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
https://api.burgan.com.tr/api/v2/discovery/workflows/enviroment/functions/available-enviroments
```

### Kullanım Alanı

Bir workflow'un genel fonksiyonlarını çağırmak. Örneğin, tüm environment listesini almak gibi belirli bir instance'a bağlı olmayan sorgular.

---

## Tip 3: `instance-function`

Belirli bir workflow instance'ı üzerinde fonksiyon çağrısı. En spesifik seviye.

### URL Şablonu

```
{baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/functions/{function}
```

### Zorunlu Alanlar

`type`, `runtime`, `domain`, `workflow`, `key`, `function`, `requiredToken`

### Örnek: Info

```json
{
  "type": "instance-function",
  "runtime": "v2",
  "domain": "discovery",
  "workflow": "enviroment",
  "key": "mobile-app",
  "function": "info",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
https://api.burgan.com.tr/api/v2/discovery/workflows/enviroment/instances/mobile-app/functions/info
```

### Örnek: Data

```json
{
  "type": "instance-function",
  "runtime": "v2",
  "domain": "discovery",
  "workflow": "enviroment",
  "key": "mobile-app",
  "function": "data",
  "requiredToken": [
    { "provider": "morph-idm-1fa", "token": "access" },
    { "provider": "morph-idm-device", "token": "access" }
  ]
}
```

### Oluşan URL

```
https://api.burgan.com.tr/api/v2/discovery/workflows/enviroment/instances/mobile-app/functions/data
```

### Kullanım Alanı

Belirli bir instance'ın bilgilerini veya verisini almak. Örneğin, `mobile-app` environment instance'ının konfigürasyon verisini sorgulamak.

---

## URL Oluşturma Kuralları

SDK, descriptor'daki `type` alanına göre URL'i şu şekilde oluşturur:

```
domain-function:
  {baseUrl}/api/{runtime}/{domain}/functions/{function}

workflow-function:
  {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/functions/{function}

instance-function:
  {baseUrl}/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/functions/{function}
```

- `baseUrl`: Aktif stage'in `baseUrl` değerinden alınır
- `runtime`: Descriptor'daki `runtime` alanı (ör. `v2` → URL'de `/api/v2/...`)
- Diğer alanlar doğrudan descriptor'dan okunur

## Token Çözümleme Akışı

Bir fonksiyon çağrısı yapılmadan önce SDK şu adımları izler:

1. Descriptor'daki `requiredToken` listesini okur
2. Her token için ilgili auth provider'da geçerli bir token olup olmadığını kontrol eder
3. Tüm token'lar mevcutsa, HTTP isteği oluşturulur ve Authorization header'larına eklenir
4. Eksik veya süresi dolmuş token varsa, ilgili provider'ın `grantFlow`'u tetiklenir
5. Token'lar sağlandıktan sonra orijinal fonksiyon çağrısı yeniden denenir

## Mevcut Yapıdan Farklar

### `configEndpoint` (eski format)

Mevcut environment JSON'larında `configEndpoint` şu formatta tanımlı:

```json
{
  "runtime": "v2",
  "level": "instance",
  "domain": "discovery",
  "workflow": "enviroment",
  "key": "mobile-app",
  "function": "enviroment",
  "requiredToken": [...]
}
```

Yeni standartta `level: "instance"` yerine `type: "instance-function"` kullanılır. Bu daha açıklayıcıdır çünkü hem seviyeyi hem de yapılan operasyonun tipini (`function` çağrısı) ifade eder.

| Eski | Yeni |
|------|------|
| `level: "instance"` | `type: "instance-function"` |
| Sadece instance seviyesini destekler | Üç seviyeyi tek standartta destekler |
| Tip bilgisi örtük | Tip bilgisi açık ve deklaratif |

## Validasyon Kuralları

SDK, descriptor'ı işlemeden önce aşağıdaki validasyonları yapar:

| type | Zorunlu Alanlar |
|------|----------------|
| `domain-function` | `runtime`, `domain`, `function`, `requiredToken` |
| `workflow-function` | `runtime`, `domain`, `workflow`, `function`, `requiredToken` |
| `instance-function` | `runtime`, `domain`, `workflow`, `key`, `function`, `requiredToken` |

Eksik alan varsa SDK hata fırlatır. `type` alanı tanınmayan bir değerse SDK hata fırlatır.
