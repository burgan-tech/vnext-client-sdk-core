# Navigation

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

> TODO : MDI modda route edildiğinde new tab mı, var olan bir tabda replace mi, ve açıksa aktif mi yeni tab mı olması gerektiği de navigation property olmalı.

İstemci kullanıcı tarafından tıklanabilir, etkileşimde kullanmak için navigasyon içeriğini dinamik olarak backend sistemden çeker.

Bu noktada navigasyon içeriği çekilirken bir anahtar belirterek ve bir context verisi verilerek çekilir. Bu anahtara uygun navigasyon verisi sağlanan veri kümesi filtrelenerek feature management ile backend'de render edilerek istemciye sunulur. İstemci gelen navigation türlerini render ederek direkt kullanıcı kullanımına sunar.

Dynamic view'ler (UI component'ları) içerisinde `neo_navigation_group` ve `neo_navigation` aşağıdaki gibi temel konfigürasyonlar içerir.

İstemci render anında sırası ile;
* Bileşen tanımı içerisindeki data tanımlarında değişkenleri tespit eder
* Değişkenler açılan context'e göre replace edilerek sağlanacak veri kümesi oluşturulur
  * Tüm sayfalarda ortak değişkenler: `$view`, `$referer`
  * Workflow Manager ile yüklenmiş sayfalarda değişkenler: `$instance`, `$domain`, `$workflow`, `$version`, `$state`
  * Sayfaya parametre geçilmiş değişkenler: `@` simgesi ile başlayan değişkenlerdir. Bu değişkenler örneğin navigasyondan data adı altında `promoteAs` denilen değişkenle aktarılır.
* Fonksiyon çağrılarak context menu için gelen navigation item'lar sırasına göre render edilir


## Senaryo 1
Bir hesap detayı sayfasında (dynamic view) içerisinde bir iş akışını başlatacak navigasyon butonu kullanımı.

### A - Navigation Button

Dinamik sayfa tanımı içerisinde `neo_navigation` bileşeni ile kullanılacak buton tanımı yapılır. 
Bu noktada bu navigation'ın nasıl çalışacağı ile ilgili bilgi, backend sisteminde **navigationKey** alanına denk gelen bir iş akış kaydıdır.
Bu navigasyon ile ilgili detaylar ise arka tarafta feature management ile navigation management backend sistemleri ile değerlendirilerek sağlanır.

Navigation bileşenleri aynı zamanda arka sistemin değerlendirmesinde kullanacağı veya geri dönüşünde kullanabileceği parametre bilgilerini sağlar.

Bu örnekte navigasyon tarafına hesap detay sayfası data context'inde bulunan `account.accountNo`, `account.amount.balance` ve `account.amount.currency` bilgileri parametre olarak sağlanır.


```json
{
  "type": "neo_navigation",
  "args": {
    "navigationKey": "quick-transfer",
    "type": "primaryButton",
    "theme": "default",
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "iban",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.iban"
      },
      {
        "type": "dataManager",
        "promoteAs": "balance",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.amount.balance"
      },
      {
        "type": "dataManager",
        "promoteAs": "currency",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.amount.currency"
      }
    ]
  }
}
```


### B - Navigation Evaluation
Dynamic view render edilirken `neo_navigation` sırası geldiğinde, bileşen backend'e key ile çağrısını yaparak evaluation talebinde bulunur.

Çağrı içerisindeki `view` ve `referer` parametreleri standart olur; bulunduğu sayfanın adı ve gelinen sayfanın adını içerir.

Workflow başlatan referer bilgisi, workflow transition view'leri arasında ortak dolaştırılır. Bu parametre ek olarak `rootReferer` olarak parametre geçilir.

> /**navigation**/workflow/**navigation-item**/instance/**quick-transfer**/functions/**evaluate**

#### Request:

Sağlanan parametrelerle evaluation süreci şöyle çalışacaktır:
* Eğer balance 0 ise para transferi disable olarak sunulacaktır, çünkü hesapta bakiye yok.
* Eğer currency TL ise FAST/EFT iş akışı başlatmaya yönlendirilecektir.
* Eğer currency TL harici ise SWIFT iş akışı başlatmaya yönlendirilecektir.

```json
{
  "view": "account-details",
  "referer": "account-list",
  "iban": "TR123456789012345678901234",
  "balance": 5000.00,
  "currency": "TL"
}
```


#### Response:

`money-transfer` iş akışını başlatırken `start` transition'ına parametre olarak `sourceAccount` adı altında kaynak hesap bilgisi predefined olarak geçilir. Bu, para transfer sayfasında kaynak hesap seçim combo'sunda ilgili değerin seçili gelmesini sağlayacaktır.

```json
{
  "type": "workflow",
  "version": "v2",
  "key": "money-transfer",
  "order": 100000,
  "title": "Para Transferi",
  "subtitle": "Bakiye: 5.000 TL",
  "iconUrn": "urn:local:icons:transfer_20px:svg",
  "disabled": false,
  "badge": {
    "isNew": false,
    "isHot": true,
    "count": false
  },
  "config": {
    "key": "money-transfer-workflow",
    "domain": "transfer",
    "version": "1.1",
    "flow": "workflow"
  },
  "data": [
    {
      "type": "static",
      "promoteAs": "sourceAccount",
      "value": "TR123456789012345678901234"
    }
  ]
}
```

## Senaryo 2 - Çoklu Navigasyon

Aşağıda bir hesap detay sayfası açıkken kullanılan `neo_navigation_group` konfigürasyonu örneği gösterilmektedir:

> /**navigation**/workflow/**navigation-group**/instance/**account-detail**/functions/**evaluate**

```json
{
  "type": "neo_navigation_group",
  "args": {
    "navigationKey": "account-detail",
    "type": "big_with_chevron",
    "theme": "default",
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "iban",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.iban"
      },
      {
        "type": "dataManager",
        "promoteAs": "balance",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.amount.balance"
      },
      {
        "type": "dataManager",
        "promoteAs": "currency",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.amount.currency"
      },
      {
        "type": "dataManager",
        "promoteAs": "type",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.productCode"
      },
      {
        "type": "dataManager",
        "promoteAs": "kmh",
        "context": "device",
        "scope": "inMemory",
        "key": "account/{{@accountNo}}",
        "path": "account.kmh.amount.balance"
      }
    ]
  }
}
```

Evaluation sonucunda sonuç bir dizi olarak navigasyon bileşenleri döner; hesap hareketleri (dynamic_view), hesabı kapat (workflow), para gönder (workflow) gibi.




## Navigasyon Türleri

| Tip | Açıklama | Teknik Detay | Rozetler | Özel Özellikler |
|-----|----------|---------------|----------|----------------|
| **divider** | Görsel ayırıcı | UI separator element | - | Visual grouping |
| **group** | Menü grubu/kategorisi | Multi-level menu container | isNew, isHot, Count | Children/Items, Expandable, Subtitle, Order, Disabled |
| **search** | Arama ve listeleme | Search interface with filtering | isNew, isHot, Count | FetchOnLoad, FixedStates[], PageSize, Subtitle, Order, Disabled |
| **dynamicView** | Backend'den dinamik view | Dynamic UI component loading from API | isNew, isHot | Server-side rendering, Hot reload, Subtitle, Order, Disabled |
| **workflow** | İş akışı başlatma | Workflow initiation | isNew, isHot | V1/V2 support, Data injection, Subtitle, Order, Disabled |
| **instance** | Aktif iş akışı örneği | Active workflow instance | isNew, isHot | Instance tracking, Subtitle, Order, Disabled |
| **staticView** | Statik UI component | Local component rendering | isNew, isHot | Client-side rendering, Subtitle, Order, Disabled |
| **webView** | Harici web sayfası | External URL handling | isNew, isHot | Authentication, Token injection, Subtitle, Order, Disabled |

## Backend'den İstemciye Dönen Yanıt Yapısı

Backend tarafından istemciye dönen navigasyon yapısı, istemci bilgileri, kullanıcı rolleri ve güvenlik seviyesine göre filtrelenerek aşağıdaki formatta döner:

### Navigation Response Structure

Navigation response'u bir object yapısındadır ve iki ana alan içerir:

```json
{
  "homepage": "account-list",
  "items": [
    {
      "type": "group",
      "key": "account-operations",
      ...
    }
  ]
}
```

#### Homepage Metadata

- **homepage**: `string` (required) - Ana sayfa olarak gösterilecek navigation item'ının `key` değeri
- **items**: `array` (required) - Navigation item'larının listesi

**Homepage Seçimi:**
- Homepage, navigation items içindeki herhangi bir item'ın `key` değeri olabilir
- Genellikle ilk görünen ana grup veya en önemli navigation item'ı seçilir
- SDK, uygulama açıldığında `homepage` key'ine sahip navigation item'ını otomatik olarak gösterir
- Homepage item'ı navigation menüsünde de görünür (normal bir navigation item olarak)

**Örnek Senaryolar:**
- **Device Token**: `"homepage": "authentication"` - Giriş/Kayıt grubu ana sayfa
- **1FA Token**: `"homepage": "account-list"` - Hesap listesi ana sayfa
- **2FA Token**: `"homepage": "account-list"` - Hesap listesi ana sayfa

## Badge ve UI Elementleri

Her navigasyon öğesi aşağıdaki ek UI elementlerini destekler:

### Subtitle
- **Amaç**: Ana başlığın altında ek açıklama metni
- **Kullanım**: Özellik açıklaması, durum bilgisi, kısa rehber
- **Format**: String, çok satırlı olabilir

### Disabled State (Devre Dışı Durum)

Navigation item'lar backend feature management tarafından devre dışı bırakılabilir:

```json
{
  "type": "workflow",
  "key": "money-transfer",
  "title": "Para Transferi",
  "subtitle": "Geçici olarak kullanılamıyor",
  "disabled": true,
  "disabledReason": "Sistem bakımı nedeniyle geçici olarak kapalı",
  "iconUrn": "urn:local:icons:transfer_20px:svg"
}
```

#### Disabled Property'leri
- **disabled**: Boolean - Item'ın devre dışı olup olmadığı
- **disabledReason**: String - Kullanıcıya gösterilecek açıklama metni (opsiyonel)

#### UI Davranışı
- **Görsel**: Item gri/soluk görünür, tıklanamaz durumda
- **Tooltip**: disabledReason varsa hover/long press'te gösterilir
- **Accessibility**: Screen reader için "devre dışı" bilgisi eklenir

#### Kullanım Senaryoları
- **Sistem Bakımı**: Belirli servisler geçici kapalı
- **Yetki Eksikliği**: Kullanıcının erişim hakkı yok
- **İş Kuralları**: Hesap blokeli, limit aşımı gibi durumlar
- **Zaman Kısıtı**: Sadece belirli saatlerde aktif olan işlemler

### Badge Sistemi
Badge sistemi navigasyon öğelerinde görsel işaretleme sağlar:

```json
"badge": {
  "isNew": true,        // Yeni özellik işaretlemesi
  "isHot": false,       // Popüler/trend özellik işaretlemesi  
  "count": true         // Sayısal rozet gösterimi (client-side query)
}
```

#### Badge Türleri
- **isNew**: Yeni eklenen özellikler için kırmızı "YENİ" rozeti
- **isHot**: Popüler/trend özellikler için turuncu "POPÜLER" rozeti
- **count**: Sayısal rozet gösterimi için boolean flag - Client tarafında query edilerek değer bind edilir
- **Kombinasyon**: Multiple badge'ler aynı anda kullanılabilir

#### Badge Kullanım Örnekleri

```json
// Sadece yeni özellik
"badge": {
  "isNew": true
}

// Sadece popüler özellik  
"badge": {
  "isHot": true
}

// Sadece count rozeti
"badge": {
  "count": true
}

// Yeni ve popüler özellik
"badge": {
  "isNew": true,
  "isHot": true
}

// Yeni özellik + count rozeti
"badge": {
  "isNew": true,
  "count": true
}

// Tüm badge türleri
"badge": {
  "isNew": true,
  "isHot": true, 
  "count": true
}
```

#### UI Görünüm Kuralları
- **Öncelik Sırası**: isNew > isHot > count
- **Renk Kodları**: 
  - isNew: Kırmızı (#FF4444)
  - isHot: Turuncu (#FF8800) 
  - count: Mavi (#0088FF)
- **Pozisyon**: İkon/başlık sağ üst köşesi
- **Animasyon**: Yeni badge'ler hafif pulse efekti

#### Count Badge İşleyişi

Count badge'i `true` olarak ayarlandığında:

1. **Backend Response**: `"count": true` ile client'a bilgi verilir
2. **Client-side Query**: İstemci ilgili endpoint'i sorgular
3. **Dynamic Binding**: Dönen sayısal değer badge'e bind edilir
4. **UI Render**: Sayı ile birlikte mavi rozet gösterilir

**Örnek Senaryolar:**
- **Predefined Search**: "Aktif hesap sayısı" - Client hesap listesi endpoint'ini sorgular
- **Notification Count**: "Okunmamış bildirim" - Client notification endpoint'ini sorgular  
- **Pending Tasks**: "Bekleyen işlem" - Client task endpoint'ini sorgular

**Avantajları:**
- Backend performansı: Sayısal değerler real-time hesaplanmaz
- Flexibility: Client ihtiyaca göre farklı endpoint'leri sorgulayabilir
- Caching: Client-side cache stratejileri uygulanabilir

## Order (Sıralama) Sistemi

Feature management ve yetkilendirme sonrası filtrelenen navigasyon öğeleri, `order` alanına göre sıralanır.

### Order Numaralama Stratejisi

**Gap-based Numbering**: 10, 20, 30... formatında numaralama
- **Avantaj**: Araya yeni öğe eklerken mevcut numaraları değiştirmek gerekmez
- **Örnek**: 10, 20, 30 arasına 25 eklenebilir

### Multi-level Order Sistemi

6 haneli numaralama ile hierarchical yapı desteklenir:

```json
// Ana seviye: XX0000
"order": 100000,  // İlk ana grup
"order": 200000,  // İkinci ana grup

// Alt seviye: XXXX00  
"order": 101000,  // İlk ana grup, ilk alt grup
"order": 101100,  // İlk ana grup, ikinci alt grup

// Üçüncü seviye: XXXXXX
"order": 101010,  // İlk ana grup, ilk alt grup, ilk öğe
"order": 101020,  // İlk ana grup, ilk alt grup, ikinci öğe
```

### Order Yapısı Örnekleri

```json
// Basit sıralama
{
  "type": "search",
  "key": "account-list", 
  "order": 100000,
  "title": "Hesap Listesi"
}

// Multi-level örnek
{
  "type": "group",
  "key": "banking-services",
  "order": 100000,
  "title": "Bankacılık Hizmetleri",
  "children": [
    {
      "type": "search",
      "key": "account-list",
      "order": 101000, 
      "title": "Hesap Listesi"
    },
    {
      "type": "workflow", 
      "key": "account-opening",
      "order": 102000,
      "title": "Hesap Açma"
    }
  ]
}
```

### Sıralama Kuralları

1. **Ascending Order**: Küçükten büyüğe sıralama (100000, 200000, 300000...)
2. **Missing Order**: Order tanımlanmamışsa en alta yerleştirilir
3. **Same Order**: Aynı order değeri durumunda key'e göre alfabetik sıralama
4. **Client Responsibility**: Sıralama client tarafında yapılır, JSON order'ına bağlı değil

## Genel Yanıt Kümesi 

```json
{
  "homepage": "account-list",
  "items": [
    {
      "type": "divider",
      "version": "v1"
    },
  {
    "type": "group",
    "version": "v1",
    "key": "account-operations",
    "order": 100000,
    "title": "Hesap İşlemleri",
    "subtitle": "Hesap açma, listeleme ve transfer işlemleri",
    "iconUrn": "urn:local:icons:account_operations_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": true,
      "isHot": false,
      "count": true
    },
    "config": {
      "expandable": true,
      "defaultExpanded": false
    },
    "children": [
  {
    "type": "search",
    "version": "v2",
    "key": "account-list",
        "order": 101000,
    "title": "Hesap Listesi",
        "subtitle": "Tüm hesaplarınızı görüntüleyin",
    "iconUrn": "urn:local:icons:account_list_20px:svg",
    "disabled": false,
    "disabledReason": null,
        "badge": {
          "isNew": false,
          "isHot": true,
          "count": true
        },
        "config": {
          "key": "account-list",
          "version": "1.4",
          "domain": "account",
          "flow": "view"
        }
      },
      {
        "type": "workflow",
        "version": "v2",
        "key": "account-opening-workflow",
        "order": 102000,
        "title": "Hesap Açma",
        "subtitle": "Yeni hesap açın",
        "iconUrn": "urn:local:icons:account_open_20px:svg",
        "disabled": false,
        "disabledReason": null,
        "badge": {
          "isNew": true,
          "isHot": true
        },
        "config": {
          "key": "account-opening-workflow",
          "domain": "account",
          "version": "1.1",
          "flow": "workflow"
        }
      }
    ]
  },
  {
    "type": "search",
    "version": "v2",
    "key": "account-list",
    "order": 200000,
    "title": "Hesap Listesi",
    "subtitle": "Aktif hesaplarınızı yönetin",
    "iconUrn": "urn:local:icons:account_list_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": false,
      "isHot": false,
      "count": true
    },
    "config": {
      "key": "account-list",
      "version": "1.4",
      "domain": "account",
      "flow": "view"
    }
  },
  {
    "type": "search",
    "version": "v1",
    "key": "saving-account-list",
    "order": 300000,
    "title": "Vadeli Hesap Listesi",
    "subtitle": "Vadeli mevduat hesaplarınız",
    "iconUrn": "urn:local:icons:saving_account_list_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": false,
      "isHot": false,
      "count": true
    },
    "config": {
      "file": "savingAccountList.json"
    }
  },
  {
    "type": "dynamicView",
    "version": "v1",
    "key": "profile-v1",
    "order": 400000,
    "title": "Profil Ayarları",
    "subtitle": "Kişisel bilgilerinizi yönetin",
    "iconUrn": "urn:local:icons:profile_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": false,
      "isHot": false,
      "count": false
    },
    "config": {
      "view": "display-profile",
      "version": "1.1"
    },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "iban",
        "context": "device",
        "scope": "inMemory",
        "key": "account/TR3465346578900045",
        "path": "account.iban"
      },
      {
        "type": "dataManager",
        "promoteAs": "accountType",
        "context": "device",
        "scope": "inMemory",
        "key": "account/TR3465346578900045",
        "path": "account.type"
      }
    ]
  },
  {
    "type": "dynamicView",
    "version": "v2",
    "key": "profile-v2",
    "order": 500000,
    "title": "Profil Ayarları",
    "subtitle": "Gelişmiş profil yönetimi",
    "iconUrn": "urn:local:icons:profile_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": true,
      "isHot": false,
      "count": false
    },
    "config": {
      "key": "display-profile",
      "domain": "IDM",
      "version": "1.1",
      "flow": "view"
    },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "iban",
        "context": "device",
        "scope": "inMemory",
        "key": "account/TR3465346578900045",
        "path": "account.iban"
      },
      {
        "type": "dataManager",
        "promoteAs": "accountType",
        "context": "device",
        "scope": "inMemory",
        "key": "account/TR3465346578900045",
        "path": "account.type"
      }
    ]
  },
  {
    "type": "workflow",
    "version": "v1",
    "key": "update-password-workflow-v1",
    "order": 600000,
    "title": "Şifre Güncelle",
    "subtitle": "Giriş şifrenizi değiştirin",
    "iconUrn": "urn:local:icons:circle_password_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": false,
      "isHot": true,
      "count": false
    },
    "config": {
      "workflow": "update-password",
      "transitionId": "update-password-workflow"
    },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "scope",
        "context": "user",
        "scope": "inMemory",
        "key": "userInfo",
        "path": "user.tckn"
      }
    ]
  },
  {
    "type": "workflow",
    "version": "v2",
    "key": "update-password-workflow-v2",
    "order": 700000,
    "title": "Şifre Güncelle",
    "subtitle": "Gelişmiş şifre yönetimi",
    "iconUrn": "urn:local:icons:circle_password_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": true,
      "isHot": true,
      "count": false
    },
    "config": {
      "key": "update-password-workflow",
      "domain": "IDM",
      "version": "1.1",
      "flow": "workflow"
    },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "scope",
        "context": "user",
        "scope": "inMemory",
        "key": "userInfo",
        "path": "user.tckn"
      }
    ]
  },
  {
    "type": "instance",
    "version": "v2",
    "key": "loan-application-instance-8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1",
    "order": 800000,
    "title": "Kredi Başvurum",
    "subtitle": "Devam eden başvurunuz",
    "iconUrn": "urn:local:icons:loan_application_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": false,
      "isHot": true,
      "count": false
    },
    "config": {
      "id": "8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1",
      "workflow": {
        "key": "loan-application-workflow",
        "domain": "loan",
        "version": "1.1",
        "flow": "workflow"
      }
    }
  },
  {
    "type": "staticView",
    "version": "v1",
    "key": "dashboard-v1",
    "order": 900000,
    "title": "Dashboard",
    "subtitle": "Ana kontrol paneli",
    "iconUrn": "urn:local:icons:dashboard_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": false,
      "isHot": false,
      "count": true
    },
  "config": {
    "component": "dashboardWidget"
  },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "scope",
        "context": "user",
        "scope": "inMemory",
        "key": "userInfo",
        "path": "user.tckn"
      }
    ]
  },
  {
    "type": "webView",
    "version": "v1",
    "key": "investment",
    "order": 950000,
    "title": "Yatırım",
    "subtitle": "Yatırım portalına erişim",
    "iconUrn": "urn:local:icons:investment_20px:svg",
    "disabled": false,
    "disabledReason": null,
    "badge": {
      "isNew": true,
      "isHot": false,
      "count": false
    },
    "config": {
      "url": "https://www.burganyatirim.com.tr/login",
      "method": "post"
    },
    "data": [
      {
        "type": "dataManager",
        "promoteAs": "scope",
        "context": "user",
        "scope": "inMemory",
        "key": "userInfo",
        "path": "user.tckn"
      }
    ]
  }
  ]
}
```

## Navigasyon Türleri Detayı

### 1. Divider (Ayırıcı)

Görsel ayırma için kullanılan basit bir element.

**Yapısı:**
```json
{
  "type": "divider",
  "version": "v1"
}
```

### 2. Group (Menü Grubu)

Multi-level menu yapısı oluşturmak için kullanılır. İçerisinde diğer navigasyon türlerini barındırabilir.

**Yapısı:**
```json
{
  "type": "group",
  "version": "v1",
  "key": "account-operations",
  "title": "Hesap İşlemleri",
  "subtitle": "Hesap yönetimi ve işlemleri",
  "iconUrn": "urn:local:icons:account_operations_20px:svg",
  "badge": {
    "isNew": false,
    "isHot": true,
    "count": true
  },
  "config": {
    "expandable": true,
    "defaultExpanded": false,
    "maxDepth": 3
  },
  "children": [
    {
      "type": "search",
      "version": "v2",
      "key": "account-list",
      "order": 101000,
      "title": "Hesap Listesi",
      "subtitle": "Tüm hesaplarınızı görüntüleyin",
      "iconUrn": "urn:local:icons:account_list_20px:svg",
      "badge": {
        "isNew": false,
        "isHot": true,
        "count": true
      },
      "config": {
        "key": "account-list",
        "version": "1.4",
        "domain": "account",
        "flow": "view"
      }
    },
    {
      "type": "group",
      "version": "v1",
      "key": "account-sub-operations",
      "order": 102000,
      "title": "Hesap Alt İşlemleri",
      "subtitle": "Detaylı hesap işlemleri",
      "iconUrn": "urn:local:icons:account_sub_20px:svg",
      "badge": {
        "isNew": false,
        "isHot": false,
        "count": true
      },
      "config": {
        "expandable": true,
        "defaultExpanded": false
      },
      "children": [
        {
          "type": "workflow",
          "version": "v2",
          "key": "account-transfer",
          "order": 102010,
          "title": "Hesap Arası Transfer",
          "subtitle": "Kendi hesaplarınız arasında transfer",
          "iconUrn": "urn:local:icons:transfer_20px:svg",
          "disabled": false,
          "disabledReason": null,
          "badge": {
            "isNew": false,
            "isHot": true,
            "count": false
          },
          "config": {
            "key": "account-transfer-workflow",
            "domain": "transfer",
            "version": "1.1",
            "flow": "workflow"
          },
          "data": [
            {
              "type": "static",
              "promoteAs": "transferType",
              "value": "internal"
            }
          ]
        }
      ]
    }
  ]
}
```

#### Group Konfigürasyon Parametreleri

* **expandable**: Grubun açılıp kapanabilir olup olmadığı
* **defaultExpanded**: Varsayılan olarak açık mı kapalı mı olacağı
* **maxDepth**: Maximum iç içe grup derinliği (performans için)
* **children**: İçerdiği alt navigasyon öğeleri

### 3. Search (Arama)

Veri arama ve listeleme işlemleri için kullanılır. Hem V1 hem V2 versiyonlarını destekler.

#### V2 Yapısı

V2 yapısında arama arayüzü ile temel konfigürasyonlar bir iş akışı içerisinde `search view` tipinde tutulur. İstemci, SDK içerisinde hazır bulunan arama sayfasının bir örneğini yaratarak ilgili konfigürasyon bilgilerini uygular.

```json
{
  "type": "search",
  "version": "v2",
  "key": "account-list",
  "title": "Hesap Listesi",
  "iconUrn": "urn:local:icons:account_list_20px:svg",
  "config": {
    "key": "account-list",
    "version": "1.4",
    "domain": "account",
    "flow": "view"
  }
}
```


#### V1 Yapısı

V1 arama arayüzünün konfigürasyonu JSON dosyalar içinde proje ile deploy edilmektedir. Benzer şekilde istemci arama arayüzünü ayağa kaldırır ve ayarlar dosyasından ilgili ayarları yaparak arama arayüzünü kullanıcıya sunar.



```json
{
  "type": "search",
  "version": "v1",
  "key": "saving-account-list",
  "title": "Vadeli Hesap Listesi",
  "iconUrn": "urn:local:icons:saving_account_list_20px:svg",
  "config": {
    "file": "savingAccountList.json"
  }
}
```

### 4. Dynamic View (Dinamik Görünüm)

Backend'den dinamik olarak çekilen view'lar (UI component'ları) için kullanılır. Hem TypeScript (web) hem de Flutter (mobil) platformlarında aynı interface ve davranışı sağlar.

#### V2 Yapısı

V2 yapısında dinamik view'lar backend'den çekilir ve istemci tarafında runtime'da render edilir. Amorphie Studio'da tasarlanan view'lar domain bazlı olarak organize edilir.

Oluşturulan ekrana parametre olarak geçecek binding context, Data Manager tarafından verilerden oluşturulur. İlgili veri kümeleri render edilen arayüzde bulunan elementlere (UI component'larına) bind etmek için kullanılır. V1'den temel fark domain organizasyonu ve key-based erişimde; binding mekanizması aynıdır.

```json
{
  "type": "dynamicView",
  "version": "v2",
  "key": "profile-v2",
  "title": "Profil Ayarları",
  "iconUrn": "urn:local:icons:profile_20px:svg",
  "config": {
    "key": "display-profile",
    "domain": "IDM",
    "version": "1.1",
    "flow": "view"
  },
  "data": [
    {
      "promoteAs": "iban",
      "context": "device",
      "scope": "inMemory",
      "key": "account/TR3465346578900045",
      "path": "account.iban"
    }
  ]
}
```

#### V1 Yapısı

V1 yapısında view'lar doğrudan view adı ve versiyonu ile çağrılır. Daha basit bir yapıya sahiptir ancak domain organizasyonu yoktur. 

Oluşturulan ekrana parametre olarak geçecek binding context, Data Manager tarafından verilerden oluşturulur. İlgili veri kümeleri render edilen arayüzde bulunan elementlere (UI component'larına) bind etmek için kullanılır. Dynamic JSON içinde component'larda tanımlı alan adları üzerinden binding işlemi gerçekleştirilir.

```json
{
  "type": "dynamicView",
  "version": "v1",
  "key": "profile-v1",
  "title": "Profil Ayarları",
  "iconUrn": "urn:local:icons:profile_20px:svg",
  "config": {
    "view": "display-profile",
    "version": "1.1"
  },
  "data": [
    {
      "promoteAs": "iban",
      "context": "device",
      "scope": "inMemory",
      "key": "account/TR3465346578900045",
      "path": "account.iban"
    }
  ]
}
```

### 5. Workflow (İş Akışı)

Yeni iş akışı başlatmak için kullanılır. Amorphie Runtime'ın hem V1 hem V2 sürümlerini destekler.

#### V2 Yapısı

V2 yapısında workflow'lar domain bazlı organize edilir ve key-based erişim sağlar. Daha gelişmiş versiyon yönetimi ve domain organizasyonu sunar.
```json
{
  "type": "workflow",
  "version": "v2",
  "key": "update-password-workflow-v2",
  "title": "Şifre Güncelle",
  "iconUrn": "urn:local:icons:circle_password_20px:svg",
  "config": {
    "key": "update-password-workflow",
    "domain": "IDM",
    "version": "1.1",
    "flow": "workflow"
  },
  "data": [
    {
      "promoteAs": "scope",
      "context": "user",
      "scope": "inMemory",
      "key": "userInfo",
      "path": "user.tckn"
    }
  ]
}
```

#### V1 Yapısı

V1 yapısında workflow'lar transitionId ile başlatılır. Geleneksel Amorphie Runtime V1 yapısını kullanır ve daha basit bir konfigürasyon sunar.

```json
{
  "type": "workflow",
  "version": "v1",
  "key": "update-password-workflow-v1",
  "title": "Şifre Güncelle",
  "iconUrn": "urn:local:icons:circle_password_20px:svg",
  "config": {
    "workflow": "update-password",
    "transitionId": "update-password-workflow"
  },
  "data": [
    {
      "promoteAs": "scope",
      "context": "user",
      "scope": "inMemory",
      "key": "userInfo",
      "path": "user.tckn"
    }
  ]
}
```

### 6. Instance (İş Akışı Örneği)

Aktif olan iş akışı örneklerini göstermek için kullanılır. Arayüz otomatik olarak iş akışı hangi state içerisinde ise, duruma göre `state view` veya `transition view` render ederek kullanıcıya gösterir.

Bu noktada ilgili iş akışı örneğinin hangi statüde olduğu, hangi arayüzünün çekilip gösterileceği gibi temel işlevler Workflow Manager içerisinde yönetilmektedir. Bu navigasyon doğrudan Workflow Manager içerisindeki uygun metodu tetikler.

> Instance ID bilgisi istemci tarafindan parametre olarak saglanacaktir. Feature ve Navigation managment backendleri evaluationda external sisteme gidip kullanicinin instance bilgilerini ARAMAZ.

#### Instance Navigasyonu Süreci

1. **Durum Kontrolü**: Workflow Manager, instance'ın mevcut state'ini kontrol eder
2. **View Belirleme**: State'e göre uygun view türü belirlenir (state view / transition view)
3. **Arayüz Render**: Belirlenen view kullanıcıya gösterilir
4. **Etkileşim**: Kullanıcı işlemi devam ettirir veya sonlandırır

```json
{
  "type": "instance",
  "version": "v2",
  "key": "loan-application-instance-8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1",
  "title": "Kredi Başvurum",
  "iconUrn": "urn:local:icons:loan_application_20px:svg",
  "config": {
    "id": "8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1",
    "workflow": {
      "key": "loan-application-workflow",
      "domain": "loan",
      "version": "1.1",
      "flow": "workflow"
    }
  }
}
```

### 7. Static View (Statik Görünüm)

İstemci tarafında render edilen statik UI component'ları için kullanılır. TypeScript (web) için Vue/React component'ları, Flutter (mobil) için widget'lar olarak implement edilir.

```json
{
  "type": "staticView",
  "version": "v1",
  "key": "dashboard-v1",
  "title": "Dashboard",
  "iconUrn": "urn:local:icons:dashboard_20px:svg",
  "config": {
    "component": "dashboardWidget"
  },
  "data": [
    {
      "promoteAs": "scope",
      "context": "user",
      "scope": "inMemory",
      "key": "userInfo",
      "path": "user.tckn"
    }
  ]
}
```

### 8. Web View (Harici Bağlantı)

Harici web sayfalarını açmak için kullanılır. Sayfalar `GET` veya `POST` olarak çağrılabilir. Data alanında tanımlanan veriler ilgili adrese POST olarak iletilir.

#### HTTP Metot Desteği
- **GET**: Basit sayfa açma, parametre URL'de query string olarak
- **POST**: Form data ile sayfa açma, güvenli veri aktarımı

#### Authentication & Security (Geliştirilmesi Gereken)
> **Config altında auth konuları için konfigürasyon genişletilmeli:**
> - **Token Exchange**: JWT token değişimi için endpoint
> - **Auth Code Post**: OAuth authorization code aktarımı  
> - **URL Data Mapping**: URL içerisinde data'dan gelen değerler ile dinamik URL oluşturma

#### Gelecek Geliştirmeler
- **SSO Integration**: Single Sign-On desteği
- **Custom Headers**: Özel header ekleme desteği
- **Cookie Management**: Cookie paylaşımı ve yönetimi
- **Redirect Handling**: Geri dönüş URL'lerinin işlenmesi

```json
{
  "type": "webView",
  "version": "v1",
  "key": "investment",
  "title": "Yatırım",
  "iconUrn": "urn:local:icons:investment_20px:svg",
  "config": {
    "url": "https://www.burganyatirim.com.tr/login",
    "method": "post",
    "timeout": 30000,
    "headers": {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AmorphieMobile/4.4"
    },
    "auth": {
      "type": "token_exchange",
      "tokenEndpoint": "/api/auth/exchange",
      "redirectUrl": "amorphie://callback"
    }
  },
  "data": [
    {
      "promoteAs": "userId",
      "context": "user",
      "scope": "inMemory",
      "key": "userInfo",
      "path": "user.tckn"
    },
    {
      "promoteAs": "sessionToken",
      "context": "session",
      "scope": "inMemory",
      "key": "authToken",
      "path": "token.access_token"
    }
  ]
}
```

#### Gelişmiş WebView Konfigürasyon Örneği

```json
{
  "type": "webView",
  "version": "v2",
  "key": "dynamic-investment",
  "order": 960000,
  "title": "Dinamik Yatırım",
  "subtitle": "Kişiselleştirilmiş yatırım portalı",
  "iconUrn": "urn:local:icons:investment_20px:svg",
  "badge": {
    "isNew": true,
    "isHot": true,
    "count": false
  },
  "config": {
    "url": "https://api.investment.com/portal/${userId}",
    "method": "get",
    "urlMapping": {
      "userId": "userInfo.tckn"
    },
    "auth": {
      "type": "oauth2",
      "authCode": "session.authCode",
      "clientId": "amorphie-mobile"
    }
  },
  "data": [
    {
      "promoteAs": "userInfo",
      "context": "user",
      "scope": "persistent",
      "key": "profile",
      "path": "user"
    }
  ]
}
```

## Backend Tanım Yapıları

### Workflow Tanımı

Backend'de workflow'lar için tanım yapısı:

```json
[
  {
    "workflowItemV1": {
      "key": "update-password-workflow-v1",
      "title": {
        "en": "Update Password",
        "tr": "Şifre Güncelle"
      },
      "iconUrn": "urn:local:icons:circle_password_20px:svg",
      "transitionId": "update-password-workflow",
      "clients": {
        "on-mobile-ios": "4.4",
        "on-mobile-android": "4.4",
        "on-mobile-huawei": "4.4",
        "on-web": "4.2",
        "burgan-mobile-ios": "4.2",
        "burgan-mobile-android": "4.2",
        "burgan-mobile-huawei": "4.2",
        "burgan-web": "4.2",
        "burgan-call-center": "4.2",
        "on-call-center": "4.2"
      },
      "audience": [
        "2FA"
      ],
      "roles": [
        "user"
      ]
    }
  },
  {
    "workflowItemV2": {
      "key": "update-password-workflow-v2",
      "title": {
        "en": "Update Password",
        "tr": "Şifre Güncelle"
      },
      "iconUrn": "urn:local:icons:circle_password_20px:svg",
      "workflow": "update-password-workflow",
      "version": "1.1",
      "clients": {
        "on-mobile-ios": "4.4",
        "on-mobile-android": "4.4",
        "on-mobile-huawei": "4.4",
        "on-web": "4.2",
        "burgan-mobile-ios": "4.2",
        "burgan-mobile-android": "4.2",
        "burgan-mobile-huawei": "4.2",
        "burgan-web": "4.2",
        "burgan-call-center": "4.2",
        "on-call-center": "4.2"
      },
      "audience": [
        "2FA"
      ],
      "roles": [
        "user"
      ]
    }
  }
]
```

### View Tanımı

Backend'de view'lar için tanım yapısı:

```json
[
  {
    "viewItem": {
      "key": "account-details-checking",
      "title": {
        "en": "Account Details",
        "tr": "Hesap Detayları"
      },
      "iconUrn": "urn:local:icons:property_new_20px:svg",
      "view": "account-details-checking",
      "version": "1.1",
      "clients": {
        "on-mobile-ios": "4.4",
        "on-mobile-android": "4.4",
        "on-mobile-huawei": "4.4",
        "on-web": "4.2",
        "burgan-mobile-ios": "4.2",
        "burgan-mobile-android": "4.2",
        "burgan-mobile-huawei": "4.2",
        "burgan-web": "4.2",
        "burgan-call-center": "4.2",
        "on-call-center": "4.2"
      },
      "audience": [
        "2FA"
      ],
      "roles": [
        "user"
      ]
    }
  }
]
```

## Filtreleme ve Dönüşüm

İstemcilerin kullanacağı HTTP header ile iletilen bilgilere göre backend tarafında filtreleme yapılır ve istemciye transform edilmiş yanıt döner. İstemci için herhangi bir karar mekanizması bırakılmaz.

### Filtreleme Kriterleri

* **clients**: İlgili navigasyonun hangi istemcide hangi minimum versiyonla çalışabileceğini belirler
* **audience**: Hangi güvenlik seviyesinde çalışabileceğini belirler (NA, 1FA, 2FA)
* **roles**: Kullanıcının rollerine göre filtreleme yapılır

### Localization (Çok Dilli Destek)

Backend, HTTP header'daki `Accept-Language` değerine göre tüm metin içeriklerini otomatik olarak ilgili dile çevirir:

#### Request Header
```http
Accept-Language: tr-TR,tr;q=0.9,en;q=0.8
```

#### Backend Tanımı (Internal)
```json
{
  "title": {
    "en": "Account Details",
    "tr": "Hesap Detayları", 
    "de": "Kontodetails"
  },
  "subtitle": {
    "en": "View your account information",
    "tr": "Hesap bilgilerinizi görüntüleyin",
    "de": "Ihre Kontoinformationen anzeigen"
  }
}
```

#### Client Response (Resolved)
```json
{
  "type": "staticView",
  "key": "account-details",
  "title": "Hesap Detayları",
  "subtitle": "Hesap bilgilerinizi görüntüleyin",
  "iconUrn": "urn:local:icons:account_20px:svg"
}
```

**Önemli Notlar:**
- İstemci hiçbir zaman i18n key'leri görmez
- Backend response'u tamamen resolve edilmiş metinler içerir
- Fallback language: İstenen dil mevcut değilse İngilizce döner
- Dynamic content (bakiye, hesap no gibi) formatı da locale'e göre ayarlanır

:::highlight red 💡
**roles** tanımının etkinliği için consent üzerinde multi role tanımının hayata geçirilmesi gerekmektedir. Örneğin şifre değiştirme adımı tüm kullanıcılar için çalışabilecek bir akış olduğu için `user` adında default bir role eklenebilmeli, roller kompose edilebilmeli.
:::

:::highlight yellow 💡
View Client versiyon ilişkisinin nasıl yönetileceği netleştirilmeli. Şu anda view üzerinde versiyonlar bulunuyor. Ayrıca rollere özel view versiyon ihtiyacı, platforma özel view ihtiyaçları bulunuyor.
:::

## Data Injection Yapısı

Navigasyon öğelerine veri enjekte etmek için iki farklı yaklaşım kullanılabilir:

### 1. Static Data Injection (Statik Veri Enjeksiyonu)

Backend'den gelen request verilerinin direkt olarak navigation item'lara geçilmesi:

```json
"data": [
  {
    "type": "static",
    "promoteAs": "sourceAccount",
    "value": "TR123456789012345678901234"
  },
  {
    "type": "static", 
    "promoteAs": "availableBalance",
    "value": 5000.00
  }
]
```

### 2. Data Manager Injection (Dinamik Veri Enjeksiyonu)

Data Manager tarafından yönetilen cache'den verilerin çekilmesi:

```json
"data": [
  {
    "type": "dataManager",
    "promoteAs": "iban",
    "context": "device",
    "scope": "inMemory", 
    "key": "account/TR3465346578900045",
    "path": "account.iban"
  },
  {
    "type": "dataManager",
    "promoteAs": "accountType",
    "context": "user",
    "scope": "persistent",
    "key": "userInfo",
    "path": "user.accountType"
  }
]
```

### Hibrit Kullanım Örneği

Aynı data array'inde her iki tip de kullanılabilir:

```json
"data": [
  {
    "type": "static",
    "promoteAs": "sourceAccount", 
    "value": "TR123456789012345678901234"
  },
  {
    "type": "dataManager",
    "promoteAs": "lastTransactionDate",
    "context": "device",
    "scope": "inMemory",
    "key": "account/{{@accountNo}}",
    "path": "account.lastTransaction.date"
  }
]
```

### Data Injection Parametreleri

#### Static Type Parametreleri
* **type**: `"static"` - Statik veri tipi
* **promoteAs**: İstemci tarafında kullanılacak değişken adı
* **value**: Direkt değer (string, number, boolean, object)

#### Data Manager Type Parametreleri
* **type**: `"dataManager"` - Data Manager referans tipi
* **promoteAs**: İstemci tarafında kullanılacak değişken adı
* **context**: Verinin kapsamı (device, user, session)
* **scope**: Verinin saklanma türü (inMemory, persistent)
* **key**: Cache key'i - Data Manager'da veri erişimi için unique identifier
* **path**: JSON path ile veri erişim yolu

### Data Binding Süreci

1. **Type Detection**: Her data item'ın type'ı kontrol edilir
2. **Static Processing**: `type: "static"` olan item'lar direkt value'ları ile context'e eklenir
3. **Data Manager Processing**: `type: "dataManager"` olan item'lar için Data Manager'dan veri çekilir
4. **Context Oluşturma**: Tüm veriler binding context'e promoteAs değerleri ile eklenir
5. **View Render**: Dynamic view render edilirken binding context kullanılır
6. **Element Binding**: View içindeki elementler context'ten ilgili verileri alır

### Kullanım Senaryoları

* **Static**: Backend'den gelen request verilerinin workflow'a geçilmesi
* **Data Manager**: Client-side cache'den dynamic verilerin çekilmesi
* **Hibrit**: Hem static hem dynamic verilerin birlikte kullanılması
