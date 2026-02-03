# enviroment-selector

Eger kullanici uygulamasi ile multi stage ortamlara erismek istiyorsa, ve izin verilmisse bu akis calisir.

Akisin adi: `enviroment-selector`
Akisin versiyonu: `null`
Akisin bulundugu domain: `discovery`
Transition gecisi(sync): `false`

* Akis versiyonu opsiyonel alandir ve verilmedigi durumda latest versiyonla is akisi baslar.
* `sync` degiskeni transition yanit yonetimini belirler:

### sync=true (Senkron Mod)
```
Client ──POST start/transition──▶ Backend (bekler...) ──200 + full result──▶ Client
```
- Tek HTTP call ile islem tamamlanir
- Backend tum islemleri bitirene kadar bekler
- Response icinde yeni state + data her sey gelir

### sync=false (Asenkron Mod)
```
Client ──POST start/transition──▶ Backend ──201 + {id}──▶ Client (hizli ~50ms)
                                      │
                                      ▼ (arka planda islem devam eder)

Client ──GET /state (poll)──▶ Backend ──{status: "processing"}
Client ──GET /state (poll)──▶ Backend ──{status: "ready"} ✅
Client ──GET /data──▶ Backend ──{...sonuc data...}
```
- Hizli acknowledge (201 + instance id)
- Client, state endpoint'ine long polling yapar (ready olana kadar)
- Ready oldugunda data endpoint'ten sonuc alinir


## Akis Baslatma 

```http
POST {{baseUrl}}/discovery/workflows/enviroment-selector/instances/start?sync=false
```

## Akis Verisi  
```http
GET {{baseUrl}}/discovery/workflows/enviroment-selector/instances/{{id}}/data 
```

## Akis Durumu
```http
GET {{baseUrl}}/discovery/workflows/enviroment-selector/instances/{{id}}/state 
```

## Akis adimlari

Start: 
