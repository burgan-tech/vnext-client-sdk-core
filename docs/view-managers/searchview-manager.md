# SearchViewManager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

SearchViewManager, **workflow instance'ları aramak ve listelemek** için backend'den gelen özel search view tanımlarının yönetimini sağlayan core SDK sınıfıdır.

## 🎯 Temel Amaç

**Workflow instance arama ve listeleme** işlevselliğinin yönetimi. Navigation'da `"type": "search"` olarak tanımlanmış öğeler, backend'den gelen özel search view definition'ına göre workflow instance'larını aramak ve listelemek için kullanılır.

**Önemli:** Bu bir **site içi full-text arama** değildir. Backend'de tanımlanmış workflow instance'larını (ör. kredi başvuruları, kredi kartı başvuruları) aramak ve listelemek için özel olarak oluşturulmuş bir yapıdır. Multi-flow support ile birden fazla workflow'dan instance'ları tek bir arayüzde gösterebilir.

## 🚀 Temel Sunduğu Hizmetler

* **Workflow Instance Search**: Backend'de tanımlanmış workflow instance'larını arama ve listeleme
* **Multi-Flow Support**: Birden fazla workflow'dan instance'ları tek arayüzde arama ve listeleme (ör. kredi başvuruları + kredi kartı başvuruları)
* **Schema-Driven Filtering**: Backend'den gelen filter schema'sına göre dinamik filtreleme
* **Unified Grid Interface**: Tüm flow'lar için tek bir grid arayüzü
* **Pagination per Flow**: Her workflow için ayrı pagination yönetimi
* **Full-Text Search**: Workflow instance'ları içinde full-text search desteği
* **Instance Results Management**: Arama sonuçlarının yönetimi ve caching (ETag-based)
* **Filter Management**: Workflow instance filtrelerinin yönetimi
* **Field Mapping**: Flow bazlı field mapping (farklı workflow'lar farklı field yapılarına sahip olabilir)

## 📋 Backend Response Yapısı

SearchView, backend'den gelen JSON tanımına göre **workflow instance'larını aramak ve listelemek** için özel olarak oluşturulmuş bir yapıdır. Multi-flow support ile birden fazla workflow'dan instance'ları tek bir arayüzde gösterebilir.

### **Search View Definition**

Backend'den gelen search view tanımı:

```json
{
  "searchView": {
    "flows": [
      {
        "key": "loan",
        "labels": [
          {
            "label": "Kredi Başvuruları",
            "language": "tr"
          }
        ],
        "pageSize": 20,
        "fullTextSupport": true,
        "flow": {
          "domain": "loan",
          "flow": "loan-application"
        }
      },
      {
        "key": "cc",
        "labels": [
          {
            "label": "Kredi Kartı Başvuruları", 
            "language": "tr"
          }
        ],
        "pageSize": 20,
        "fullTextSupport": true,
        "flow": {
          "domain": "credit-card",
          "flow": "cc-application"
        }
      }
    ],
    "filter": {
      "systemFilters": {"createdAt": true, "state": true},
      "customFilterSchema": {"key": "search-filters"},
      "customFilterMapping": [
        {
          "flow": "loan",
          "filter": "customer", 
          "field": "applicant.tckn"
        },
        {
          "flow": "cc",
          "filter": "customer",
          "field": "applicant.citizenshipnumber"
        }
      ]
    },
    "grid": {
      "columnSchema": {"key": "grid-columns"},
      "columns": [
        {
          "key": "applicantName",
          "sortable": true,
          "fieldMapping": [
            {"flow": "loan", "field": "applicant.firstName + ' ' + applicant.lastName"},
            {"flow": "cc", "field": "applicant.name"}
          ]
        }
      ]
    }
  }
}
```

### **Search View Yapısı**

**Flows:**
- `key`: Flow identifier (unique)
- `labels`: Çok dilli label tanımları
- `pageSize`: Her flow için sayfa başına kayıt sayısı
- `fullTextSupport`: Full-text search desteği
- `flow`: Backend flow tanımı (domain, flow)

**Filter:**
- `systemFilters`: Sistem filtreleri (createdAt, state, etc.)
- `customFilterSchema`: Özel filter schema key'i (backend'den çekilir)
- `customFilterMapping`: Flow bazlı filter field mapping

**Grid:**
- `columnSchema`: Grid column schema key'i (backend'den çekilir)
- `columns`: Grid column tanımları
  - `key`: Column identifier
  - `sortable`: Sıralanabilir mi?
  - `fieldMapping`: Flow bazlı field mapping

## 💡 Kullanım Senaryoları

### **Multi-Flow Workflow Instance Search Senaryosu**

Navigation'dan gelen search view tanımı ile birden fazla workflow'dan instance arama:

```typescript
// TypeScript (Web)
// Navigation'dan search view config alınır
const searchConfig = {
  key: "application-list",
  version: "1.4",
  domain: "application",
  flow: "view"
};

// SearchViewManager backend'den search view definition'ı çeker
// Bu definition, hangi workflow'ların aranacağını ve nasıl gösterileceğini belirler
const searchView = await searchViewManager.loadSearchView(searchConfig);

// Multi-flow workflow instance arama başlat
// Örnek: Kredi başvuruları (loan) ve kredi kartı başvuruları (cc) workflow instance'larını ara
const results = await searchViewManager.performMultiFlowSearch({
  flows: ['loan', 'cc'],  // İki farklı workflow'dan instance'lar aranır
  query: '12345678901',  // TCKN ile arama (workflow instance'ları içinde)
  filters: {
    customer: '12345678901',
    state: 'pending'  // Sadece bekleyen başvurular
  }
});

// Her workflow için ayrı instance sonuçları döner
// results = {
//   loan: { 
//     items: [loanInstance1, loanInstance2, ...],  // Kredi başvurusu instance'ları
//     total: 10, 
//     page: 1 
//   },
//   cc: { 
//     items: [ccInstance1, ccInstance2, ...],  // Kredi kartı başvurusu instance'ları
//     total: 5, 
//     page: 1 
//   }
// }
```

```dart
// Dart (Flutter)
// Navigation'dan search view config alınır
final searchConfig = {
  'key': 'application-list',
  'version': '1.4',
  'domain': 'application',
  'flow': 'view'
};

// SearchViewManager backend'den search view definition'ı çeker
final searchView = await searchViewManager.loadSearchView(searchConfig);

// Multi-flow arama başlat
final results = await searchViewManager.performMultiFlowSearch(
  flows: ['loan', 'cc'],
  query: '12345678901',  // TCKN ile arama
  filters: {
    'customer': '12345678901',
    'state': 'pending'
  }
);
```

### **Schema-Driven Workflow Instance Filtering Senaryosu**

Backend'den gelen filter schema'sına göre workflow instance'larını dinamik filtreleme:

```typescript
// TypeScript (Web)
// Backend'den filter schema çekilir
const filterSchema = await searchViewManager.getFilterSchema('search-filters');

// Filter schema'ya göre UI oluşturulur
// Kullanıcı filter'ları seçer (ör. müşteri TCKN, tarih aralığı, başvuru durumu)
const filters = {
  customer: '12345678901',
  dateRange: { from: '2024-01-01', to: '2024-12-31' },
  state: 'pending'  // Sadece bekleyen workflow instance'ları
};

// Flow bazlı field mapping uygulanır
// loan workflow instance'ları için: applicant.tckn = '12345678901'
// cc workflow instance'ları için: applicant.citizenshipnumber = '12345678901'
// Her workflow farklı field yapısına sahip olabilir
const results = await searchViewManager.performMultiFlowSearch({
  flows: ['loan', 'cc'],
  filters: filters
});
```

```dart
// Dart (Flutter)
// Backend'den filter schema çekilir
final filterSchema = await searchViewManager.getFilterSchema('search-filters');

// Filter schema'ya göre UI oluşturulur
// Kullanıcı filter'ları seçer
final filters = {
  'customer': '12345678901',
  'dateRange': {'from': '2024-01-01', 'to': '2024-12-31'},
  'state': 'pending'
};

// Flow bazlı field mapping uygulanır
final results = await searchViewManager.performSearch(
  flows: ['loan', 'cc'],
  filters: filters
);
```

### **Unified Grid Interface Senaryosu**

Farklı workflow instance'larını tek bir grid arayüzünde gösterme:

```typescript
// TypeScript (Web)
// Backend'den grid column schema çekilir
const columnSchema = await searchViewManager.getColumnSchema('grid-columns');

// Grid column'ları flow bazlı field mapping ile oluşturulur
// Her workflow farklı field yapısına sahip olabilir:
// applicantName column:
//   - loan workflow instance'ları için: applicant.firstName + ' ' + applicant.lastName
//   - cc workflow instance'ları için: applicant.name

// Unified grid'de tüm workflow instance'ları gösterilir
// Kredi başvuruları ve kredi kartı başvuruları aynı grid'de
const gridData = await searchViewManager.getGridData({
  flows: ['loan', 'cc'],
  columns: columnSchema.columns,
  sortBy: 'applicantName',
  sortOrder: 'asc'
});
```

```dart
// Dart (Flutter)
// Backend'den grid column schema çekilir
final columnSchema = await searchViewManager.getColumnSchema('grid-columns');

// Unified grid'de tüm flow sonuçları gösterilir
final gridData = await searchViewManager.getGridData(
  flows: ['loan', 'cc'],
  columns: columnSchema.columns,
  sortBy: 'applicantName',
  sortOrder: 'asc'
);
```

### **Pagination per Workflow Senaryosu**

Her workflow için ayrı pagination (her workflow farklı sayıda instance'a sahip olabilir):

```typescript
// TypeScript (Web)
// Kredi başvurusu (loan) workflow instance'ları için sayfa 2
const loanResults = await searchViewManager.performFlowSearch({
  flow: 'loan',
  query: '12345678901',
  page: 2,
  pageSize: 20  // searchView.flows[0].pageSize
});
// Sonuç: Kredi başvurusu instance'ları (21-40 arası)

// Kredi kartı başvurusu (cc) workflow instance'ları için sayfa 1
const ccResults = await searchViewManager.performFlowSearch({
  flow: 'cc',
  query: '12345678901',
  page: 1,
  pageSize: 20  // searchView.flows[1].pageSize
});
// Sonuç: Kredi kartı başvurusu instance'ları (1-20 arası)
```

```dart
// Dart (Flutter)
// Her flow için ayrı pagination
final loanResults = await searchViewManager.performFlowSearch(
  flow: 'loan',
  query: '12345678901',
  page: 2,
  pageSize: 20
);
```

### **Workflow Instance Full-Text Search Senaryosu**

Workflow instance'ları içinde full-text search (eğer flow `fullTextSupport: true` ise):

```typescript
// TypeScript (Web)
// Workflow instance'ları içinde full-text arama
// Örnek: Kredi başvurusu instance'larında "Ahmet" kelimesini ara
const results = await searchViewManager.performFlowSearch({
  flow: 'loan',
  query: 'Ahmet',  // Instance'ların içeriğinde "Ahmet" geçenleri bul
  page: 1,
  pageSize: 20
});
// Sonuç: İçinde "Ahmet" geçen kredi başvurusu instance'ları
```

```dart
// Dart (Flutter)
// Workflow instance'ları içinde full-text arama
final results = await searchViewManager.performFlowSearch(
  flow: 'loan',
  query: 'Ahmet',  // Instance'ların içeriğinde "Ahmet" geçenleri bul
  page: 1,
  pageSize: 20
);
```

## 📚 Public Interface

```typescript
// TypeScript (Web)
interface ISearchViewManager {
  // ===== SEARCH VIEW LOADING =====
  
  loadSearchView(config: {
    key: string;
    version: string;
    domain: string;
    flow: string;
  }): Promise<SearchViewDefinition>;
  
  // ===== MULTI-FLOW SEARCH =====
  
  performMultiFlowSearch(options: {
    flows: string[];
    query?: string;
    filters?: Record<string, any>;
  }): Promise<MultiFlowSearchResults>;
  
  performFlowSearch(options: {
    flow: string;
    query?: string;
    filters?: Record<string, any>;
    page?: number;
    pageSize?: number;
  }): Promise<FlowSearchResults>;
  
  // ===== SCHEMA MANAGEMENT =====
  
  getFilterSchema(schemaKey: string): Promise<FilterSchema>;
  getColumnSchema(schemaKey: string): Promise<ColumnSchema>;
  
  // ===== GRID OPERATIONS =====
  
  getGridData(options: {
    flows: string[];
    columns: ColumnDefinition[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<GridData>;
  
  // ===== SEARCH OPERATIONS =====
  
  performSearch(options: {
    query: string;
    categories?: string[];
    filters?: Record<string, any>;
  }): Promise<SearchResults>;
  
  getSuggestions(partialQuery: string): Promise<string[]>;
  clearSearch(): Promise<void>;
  
  // ===== SEARCH HISTORY =====
  
  addToHistory(query: string): Promise<void>;
  getSearchHistory(): Promise<string[]>;
  clearHistory(): Promise<void>;
  
  // ===== FILTER MANAGEMENT =====
  
  setFilters(filters: Record<string, any>): Promise<void>;
  getActiveFilters(): Record<string, any>;
  clearFilters(): Promise<void>;
  
  // ===== EVENT STREAMS =====
  
  searchEvents: Observable<SearchEvent>;  // RxJS Observable or similar
}
```

```dart
// Dart (Flutter)
abstract class ISearchViewManager {
  
  // ===== SEARCH VIEW LOADING =====
  
  Future<SearchViewDefinition> loadSearchView({
    required String key,
    required String version,
    required String domain,
    required String flow
  });
  
  // ===== MULTI-FLOW SEARCH =====
  
  Future<MultiFlowSearchResults> performMultiFlowSearch({
    required List<String> flows,
    String? query,
    Map<String, dynamic>? filters
  });
  
  Future<FlowSearchResults> performFlowSearch({
    required String flow,
    String? query,
    Map<String, dynamic>? filters,
    int? page,
    int? pageSize
  });
  
  // ===== SCHEMA MANAGEMENT =====
  
  Future<FilterSchema> getFilterSchema(String schemaKey);
  Future<ColumnSchema> getColumnSchema(String schemaKey);
  
  // ===== GRID OPERATIONS =====
  
  Future<GridData> getGridData({
    required List<String> flows,
    required List<ColumnDefinition> columns,
    String? sortBy,
    String? sortOrder
  });
  
  // ===== SEARCH OPERATIONS =====
  
  Future<SearchResults> performSearch({
    required String query,
    List<String>? categories,
    Map<String, dynamic>? filters
  });
  
  Future<List<String>> getSuggestions(String partialQuery);
  Future<void> clearSearch();
  
  // ===== SEARCH HISTORY =====
  
  Future<void> addToHistory(String query);
  Future<List<String>> getSearchHistory();
  Future<void> clearHistory();
  
  // ===== FILTER MANAGEMENT =====
  
  Future<void> setFilters(Map<String, dynamic> filters);
  Map<String, dynamic> getActiveFilters();
  Future<void> clearFilters();
  
  // ===== EVENT STREAMS =====
  
  Stream<SearchEvent> get searchEvents;
}
```

## 🔧 Type Definitions

```typescript
// TypeScript (Web)
interface SearchViewDefinition {
  flows: FlowDefinition[];
  filter: FilterConfiguration;
  grid: GridConfiguration;
}

interface FlowDefinition {
  key: string;
  labels: Array<{ label: string; language: string }>;
  pageSize: number;
  fullTextSupport: boolean;
  flow: {
    domain: string;
    flow: string;
  };
}

interface FilterConfiguration {
  systemFilters: Record<string, boolean>;
  customFilterSchema: { key: string };
  customFilterMapping: Array<{
    flow: string;
    filter: string;
    field: string;
  }>;
}

interface GridConfiguration {
  columnSchema: { key: string };
  columns: ColumnDefinition[];
}

interface ColumnDefinition {
  key: string;
  sortable: boolean;
  fieldMapping: Array<{
    flow: string;
    field: string;
  }>;
}

interface MultiFlowSearchResults {
  [flowKey: string]: FlowSearchResults;
}

interface FlowSearchResults {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

```dart
// Dart (Flutter)
class SearchViewDefinition {
  final List<FlowDefinition> flows;
  final FilterConfiguration filter;
  final GridConfiguration grid;
}

class FlowDefinition {
  final String key;
  final List<Label> labels;
  final int pageSize;
  final bool fullTextSupport;
  final FlowConfig flow;
}

class FilterConfiguration {
  final Map<String, bool> systemFilters;
  final Map<String, dynamic> customFilterSchema;
  final List<FilterMapping> customFilterMapping;
}

class GridConfiguration {
  final Map<String, dynamic> columnSchema;
  final List<ColumnDefinition> columns;
}

class ColumnDefinition {
  final String key;
  final bool sortable;
  final List<FieldMapping> fieldMapping;
}

class MultiFlowSearchResults {
  final Map<String, FlowSearchResults> results;
}

class FlowSearchResults {
  final List<dynamic> items;
  final int total;
  final int page;
  final int pageSize;
  final bool hasMore;
}
```

## 🔧 Enum Definitions

```typescript
// TypeScript (Web)
enum SearchEventType {
  searchStarted = 'searchStarted',
  searchCompleted = 'searchCompleted',
  searchFailed = 'searchFailed',
  filtersChanged = 'filtersChanged',
  flowChanged = 'flowChanged',
  pageChanged = 'pageChanged'
}
```

```dart
// Dart (Flutter)
enum SearchEventType {
  searchStarted,
  searchCompleted,
  searchFailed,
  filtersChanged,
  flowChanged,
  pageChanged
}
```
