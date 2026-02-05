# Environment

Uygulama ilk açılışta çalışacağı ortamı (stage) belirlemek için bu akışı çağırır.

## Genel Bilgi

| Özellik | Değer |
|---------|-------|
| Domain | `discovery` |
| Workflow | `enviroment` |
| Instance Key | `{{clientId}}` |

> **Not:** `clientId` ve `baseUrl` uygulama içinde hardcode edilmiştir. Bu iki değer dışında tüm konfigürasyon backend'den gelir.

## Endpoint'ler

### Instance Data (Kullanılmaz)

Tüm instance verisini döner. Client için gereksiz veri içerir, **kullanılmamalıdır**.

```http
GET {{baseUrl}}/discovery/workflows/enviroment/instances/{{clientId}}/data 
```

### Function Endpoint (Client Kullanır ✅)

Client'a özel, sadece gerekli environment konfigürasyonunu döner. **Client bu endpoint'i çağırmalıdır.**

```http
GET {{baseUrl}}/discovery/workflows/enviroment/instances/{{clientId}}/functions/enviroments 
```


## Response

Response yapısı için bkz: [environments.master.json](./schemas/environments.master.json)

Örnek response'lar:
- [environments-tester.json](./samples/environments-tester.json) - Test ortamı (multi-stage)
- [environments-production.json](./samples/environments-production.json) - Production (tek stage)