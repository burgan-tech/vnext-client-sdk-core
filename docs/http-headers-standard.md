# HTTP Headers Standardı

## Genel Bakış

Tüm API çağrılarında kullanılan standart request ve response header'ları. SDK, her çağrıda bu header'ları otomatik olarak oluşturur ve yönetir.

---

## Request Headers

### Authorization

Standart JWT Access Token bilgisini içerir. Bu token, kullanıcının kimlik doğrulamasını sağlar ve yetkilendirme işlemleri için kullanılır.

Token seçimi, endpoint descriptor'daki `requiredToken` listesine göre yapılır. Bkz: [Fonksiyon Çağrısı Standardı](./function-call-standard.md), [Workflow Operasyon Standardı](./workflow-operation-standard.md)

---

### Accept-Language

İstemcinin tercih ettiği görüntüleme dilini belirtir. Sunucu, bu bilgiye göre uygun dilde yanıt dönebilir.

---

### Geolocation

Kullanıcının cihazında konum paylaşımı açıksa, bu başlık altında geçerli coğrafi konum bilgisi iletilir. Bu bilgi, lokasyon bazlı hizmetler için kullanılabilir.

---

### traceparent

`traceparent`, W3C Trace Context standardına uygun bir izleme (tracing) başlığıdır. Bir istemci çağrıyı başlattığında, bu ID aynı işlemin tüm alt süreçleri boyunca korunur. Böylece sunucu tarafında işlemler birbirine bağlanarak takip edilebilir.

> **Not:** `X-Request-Id` yerine `traceparent` kullanılır.

- **Sayfa Yükleme:** Sayfanın render edilmesi, veri servislerinin çağrılması ve diğer işlemler bu trace ID ile takip edilir.
- **İş Akışı Başlatma:** Bir iş akışı başlatıldığında, workflow instance ID trace ID olur. Akış boyunca yüklenen sayfalar ve çağrılar bu trace altında izlenir.

---

### User-Agent

İstemcinin kullandığı uygulama ve cihaz bilgilerini içerir. Bu başlık, sunucu tarafında istemcinin türünü ve özelliklerini anlamak için kullanılır.

> **Referanslar:**
> - [User-Agent String Listesi](https://deviceatlas.com/blog/list-of-user-agent-strings)
> - [RFC 9110 User-Agent Formatı](https://www.rfc-editor.org/rfc/rfc9110#name-user-agent)

> **Uyarı:** Uygulama adı olarak `client-id` kullanılması önerilir. Bu sayede istemci taraflı çağrılar daha iyi kategorize edilebilir ve servislerin hangi istemciler tarafından tüketildiği daha iyi izlenebilir.

#### Format

```
<application-name>/<version> (<platform>; <device-info>) <engine>
```

#### Örnekler

| Platform | User-Agent |
|----------|-----------|
| Android | `amorphie-ib-mobile/2.2.1 (Android 13; Galaxy S22) WebKit/537.36` |
| Windows Chrome | `amorphie-ib-web/0.8.1 (Windows 10; Chrome 117) WebKit/537.36` |
| macOS Safari | `amorphie-ib-web/0.8.1 (macOS 13.6; Safari 17) WebKit/605.1.15` |
| Çağrı Merkezi | `amorphie-cc-web/0.8.3 (Windows 10; Chrome 117) WebKit/537.36` |

---

### X-Device

İstemci cihazını benzersiz şekilde tanımlamak için kullanılan başlıktır. `Device-Id`, cihazdan alınan benzersiz kimliği, `Installation-Id` ise uygulamanın kurulumuyla oluşturulan kimliği temsil eder. Sunucu tarafında, istemcinin tekil bir cihazdan gelip gelmediği bu bilgilerle doğrulanabilir.

#### Format

```
X-Device: {device-id},{installation-id}
```

#### Örnek

```
X-Device: 32941871-b1e8-722e-bfef-6aa0221970b5,77941871-a1e8-712e-bfef-6aa0221970a8
```

---

### X-Workflow

Bir iş akışı (workflow) başlatıldığında veya devam ettirildiğinde, ilgili sürecin hangi iş akışı ve sürümüne ait olduğunu belirtir. Ayrıca, her iş akışı örneği için benzersiz bir instance ID içermelidir.

#### Format

```
X-Workflow: {runtime-versiyon},{domain},{workflow},{workflow-version},{instance-id}
```

#### Örnek

```
X-Workflow: 1.0,account,new-saving-account,1.1,77941871-a1e8-712e-bfef-6aa0221970a8
```

---

### X-Actor

İşlemi gerçekleştiren kullanıcı, kapsam (scope) ve consent bilgilerini içerir. Bu başlık, işlemi kimin, hangi yetkiyle ve hangi consent ile yaptığını belirlemek için kullanılır.

#### Format

```
X-Actor: {user-id},{user-reference},{scope-id},{scope-reference},{consent-id}
```

#### Örnek

```
X-Actor: 01941871-005f-7140-a321-93d38f385dc2,38512019001,01941871-a1e8-712e-bfef-6aa0221970a8,38512019001,02941871-c2f9-823f-c432-94e49f486ed3
```

---

### X-Request-Source

Request'in hangi component tarafından başlatıldığını ve target bilgisini içerir. Bu bilgi, backend'de request pattern analysis, performance monitoring ve debugging için kullanılır.

#### Format

```
X-Request-Source: {component-type}:{target-info}
```

#### Component Types

| Component Type | Açıklama | Target Bilgisi |
|---------------|----------|----------------|
| `router-navigation` | Router'dan sayfa geçişi | `{route-name}` |
| `workflow-transition` | WorkflowManager'dan iş akışı transition'ı | `{workflow-name}` |
| `dynamic-view-render` | DynamicViewManager'dan view render işlemi | `{view-key}` |
| `static-view-load` | StaticViewManager'dan statik sayfa yüklemesi | `{widget-name}` |
| `webview-request` | WebViewManager'dan web içerik yüklemesi | `{url-domain}` |
| `search-query` | SearchViewManager'dan arama işlemi | `{search-category}` |
| `data-manager-fetch` | DataManager'dan veri çekme işlemi | `{data-key}` |
| `user-action` | Direct user interaction | `{action-type}` (button-click, form-submit, vb.) |
| `background-sync` | Background işlemler ve sync operasyonları | `{sync-type}` |
| `cache-refresh` | Cache refresh işlemleri | `{cache-key}` |

> **Not:** Target bilgisi dynamic olarak backend developer'ın ihtiyacına göre genişletilebilir. Component her request'te kendi context'ine uygun target bilgisini ekler.

#### Örnekler

```
X-Request-Source: router-navigation:dashboard-home
X-Request-Source: workflow-transition:loan-application
X-Request-Source: dynamic-view-render:display-profile
X-Request-Source: data-manager-fetch:user/preferences
X-Request-Source: user-action:button-click
X-Request-Source: webview-request:example.com
```

> **Önemli:** `X-Request-Source` sadece component içinde component kullanımında (composition) çalışır. Doğrudan bir view çalıştırıldığında bu header set edilmez, çünkü iç içe component hiyerarşisi yoktur ve source context anlamlı değildir.

---

### If-None-Match

İstemci tarafında cache tutulması istenmesi durumunda kullanılır. İstemci, daha önce kaydettiği bir kaydın `ETag` değerini bu başlık altında iletir. Eğer sunucu üzerinde kayıt değişmemişse, sunucu `304 Not Modified` yanıtı döner.

---

## Response Headers

### Server

| Zorunluluk | Servis |
|------------|--------|
| Zorunlu | Tümü |

Sunucunun versiyon bilgisini ve hangi domain üzerinde çalıştığını belirtir.

#### Örnek

```
Server: amorphie-runtime/2.1.3 (account)
```

---

### ETag

| Zorunluluk | Servis |
|------------|--------|
| Zorunlu | `GET /{domain}/workflows/{workflow}/instances/{instance}` |

Amorphie üzerinde her bir kaydın her güncellemede `ETag` değeri güncellenir. Bu bilgi, kayıt ile birlikte dönülür ve istemci tarafında cache yönetimi için kullanılır.

ETag değeri ULID bir değerdir. Kaydın veritabanı üzerinde her güncellenmesinde yenilenen bir değerdir.

#### Örnek

```
ETag: 01JNFVJWRYEN3NW9P0MVBMFKJV
```

---

### Content-Language

| Zorunluluk | Servis |
|------------|--------|
| Zorunlu | Tümü |

Yanıtın içerisindeki dili belirtir.

---

### Cache-Control

Sunucu tarafında cache tutulması durumunda dönecek değeri belirtir. Uygulama alanı genellikle verilerin Redis üzerinde cache kontrolüne dayanır.

#### Örnek Senaryo

Bir kayıt örneği, transition alana kadar aynı kayıttır ve `ETag` değeri değişmez. Her bir istekte cache verisi dönülür. Kayıt ile ilgili bir transition alındığında cache geçersiz kılınır (invalidate edilir).

#### Örnekler

```
Cache-Control: public      # Veri cache üzerinden dönüyor
Cache-Control: no-cache    # Cache kullanılmamış
```
