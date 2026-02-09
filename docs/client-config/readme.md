# Client Config

Uygulama ilk açılışta çalışacağı ortamı (stage) belirlemek için bu akışı çağırır.

## Genel Bilgi

| Özellik | Değer |
|---------|-------|
| Domain | `discovery` |
| Workflow | `client-config` |
| Instance Key | `{{clientId}}` |

> **Not:** `clientId` uygulama içinde hardcode edilmiştir. Bu değer dışında tüm konfigürasyon backend'den gelir.

## Endpoint'ler

### Instance Data (Kullanılmaz)

Tüm instance verisini döner. Client için gereksiz veri içerir, **kullanılmamalıdır**.

```http
GET {{baseUrl}}/discovery/workflows/client-config/instances/{{clientId}}/data 
```

### Function Endpoint (Client Kullanır ✅)

Client'a özel, sadece gerekli environment konfigürasyonunu döner. **Client bu endpoint'i çağırmalıdır.**

```http
GET {{baseUrl}}/discovery/workflows/client-config/instances/{{clientId}}/functions/config 
```


## Response
