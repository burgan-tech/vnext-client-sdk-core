# Workflow & Function Çağrı Standartları

## Genel Bakış

Backend API ile tüm etkileşimler iki kategoride standartlaştırılmıştır:

| Kategori | Amaç | HTTP Method | Doküman |
|----------|-------|-------------|---------|
| **Fonksiyon Çağrısı** | Veri sorgulama | GET | [function-call-standard.md](./function-call-standard.md) |
| **Workflow Operasyon** | İş akışı yürütme | POST / PATCH / GET | [workflow-operation-standard.md](./workflow-operation-standard.md) |

## Fonksiyon Çağrısı (Sorgu)

Üç seviyede fonksiyon çağrısı yapılabilir. `type` alanı seviyeyi belirler:

| type | URL Pattern |
|------|-------------|
| `domain-function` | `/api/{runtime}/{domain}/functions/{function}` |
| `workflow-function` | `/api/{runtime}/{domain}/workflows/{workflow}/functions/{function}` |
| `instance-function` | `/api/{runtime}/{domain}/workflows/{workflow}/instances/{key}/functions/{function}` |

Detay: [Fonksiyon Çağrısı Standardı](./function-call-standard.md)

## Workflow Operasyon (İş Akışı)

`key` ve `transition` alanlarının varlığına göre operasyon belirlenir:

| key | transition | Operasyon | URL Pattern |
|-----|-----------|-----------|-------------|
| yok | yok | Start | `POST .../instances/start` |
| var | yok | Continue | `GET .../instances/{key}` |
| var | var | Transition | `PATCH .../instances/{key}/transitions/{transition}` |

Detay: [Workflow Operasyon Standardı](./workflow-operation-standard.md)

## Ortak Yapı: requiredToken

Her iki standart da aynı `requiredToken` mekanizmasını kullanır:

```json
"requiredToken": [
  { "provider": "morph-idm-1fa", "token": "access" },
  { "provider": "morph-idm-device", "token": "access" }
]
```

SDK, listeyi sırayla kontrol eder. İlk geçerli token'ı kullanır, hiçbiri yoksa ilgili provider'ın `grantFlow`'unu tetikler.
