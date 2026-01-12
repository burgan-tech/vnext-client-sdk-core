# StateViewManager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

StateViewManager, **belirli bir statüde bekleyen workflow instance'ların statülerine özel gösterilecek içeriği kompose eden scaffold tanımlarının** yönetimini sağlayan core SDK sınıfıdır.

## 🎯 Temel Amaç

Workflow instance'ların belirli bir statüde beklerken gösterilecek içeriği backend'den gelen state view definition'ına göre kompose etmek. Tab-based kompozit yapı ile sistem bileşenleri (history, timeoutInfo), feature bileşenleri (document, notes) ve akış-özel grupları (custom view'lar) birleştirir.

**Önemli:** Bu bir workflow step değildir. Workflow instance'ın belirli bir statüde beklerken (ör. "onay bekliyor", "inceleme aşamasında") gösterilecek detay sayfasıdır. State view, workflow instance'ın mevcut durumunu ve ilgili bilgileri kompozit bir yapıda gösterir.

## 🚀 Temel Sunduğu Hizmetler

* **State-Based Composition**: Workflow instance statüsüne göre içerik kompozisyonu
* **Tab-Based Interface**: Sistem bileşenleri, feature bileşenleri ve akış-özel gruplar için tab yapısı
* **System Components**: History ve timeoutInfo gibi sistem bileşenleri
* **Feature Components**: Document, notes gibi feature bileşenleri
* **Custom View Groups**: Akış-özel custom view grupları
* **Sub-Process Support**: Alt süreç (sub-process) desteği
* **Summary View**: Workflow instance özet bilgileri
* **Transitions Display**: Workflow, shared ve feature transition'larının gösterimi

## 📋 Backend Response Yapısı

StateView, backend'den gelen JSON tanımına göre workflow instance'ın statüsüne özel içeriği kompose eder.

### **State View Definition**

Backend'den gelen state view tanımı:

```json
{
  "stateView": {
    "history": true,
    "features": [
      "document",
      "notes"
    ],
    "summary": {
      "labels": [
        {
          "label": "Kredi Başvurusu",
          "language": "tr"
        }
      ],
      "view": {
        "key": "loan-application-summary-view",
        "version": "1.1",
        "domain": "loan",
        "flow": "view",
        "flowVersion": "1.0"
      },
      "timeoutInfo": true,
      "transitions": {
        "flow": true,
        "shared": true,
        "feature": true
      },
      "groups": [
        {
          "labels": [
            {
              "label": "Başvuran Bilgileri",
              "language": "tr"
            }
          ],
          "view": {
            "key": "loan-application-applicant-info",
            "version": "1.1",
            "domain": "loan",
            "flow": "view",
            "flowVersion": "1.0"
          }
        },
        {
          "labels": [
            {
              "label": "Kredi Bilgileri",
              "language": "tr"
            }
          ],
          "view": {
            "key": "loan-application-term-info",
            "version": "1.1",
            "domain": "loan",
            "flow": "view",
            "flowVersion": "1.0"
          }
        },
        {
          "labels": [
            {
              "label": "Belgeler",
              "language": "tr"
            }
          ],
          "subProcess": {
            "key": "contract",
            "version": "1.0",
            "domain": "contract",
            "flow": "sys-flow",
            "flowVersion": "1.0"
          }
        }
      ]
    }
  }
}
```

### **State View Yapısı**

**System Components:**
- `history`: Workflow instance geçmişi gösterimi (boolean)
- `timeoutInfo`: Timeout bilgisi gösterimi (boolean, summary içinde)

**Feature Components:**
- `features`: Feature bileşenleri listesi (ör. "document", "notes")

**Summary:**
- `labels`: Çok dilli özet başlığı
- `view`: Özet bilgileri gösteren view tanımı
- `timeoutInfo`: Özet içinde timeout bilgisi gösterimi
- `transitions`: Transition gösterim ayarları
  - `flow`: Workflow transition'ları
  - `shared`: Shared transition'lar
  - `feature`: Feature transition'ları

**Groups:**
- `labels`: Çok dilli grup başlığı
- `view`: Grup içeriğini gösteren view tanımı (opsiyonel)
- `subProcess`: Alt süreç tanımı (opsiyonel, view yerine)

## 💡 Kullanım Senaryoları

### **Workflow Instance State View Senaryosu**

Workflow instance'ın belirli bir statüde beklerken state view gösterimi:

```typescript
// TypeScript (Web)
// Workflow instance'ın mevcut statüsüne göre state view çekilir
const stateView = await stateViewManager.loadStateView({
  workflowId: 'loan-application-workflow',
  instanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1',
  state: 'pending-approval'  // Mevcut statü
});

// State view kompozisyonu:
// - Summary tab: Özet bilgiler (loan-application-summary-view)
// - History tab: Workflow instance geçmişi
// - Document tab: Belgeler feature bileşeni
// - Notes tab: Notlar feature bileşeni
// - Başvuran Bilgileri tab: loan-application-applicant-info view
// - Kredi Bilgileri tab: loan-application-term-info view
// - Belgeler tab: contract sub-process
```

```dart
// Dart (Flutter)
// Workflow instance'ın mevcut statüsüne göre state view çekilir
final stateView = await stateViewManager.loadStateView(
  workflowId: 'loan-application-workflow',
  instanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1',
  state: 'pending-approval'  // Mevcut statü
);
```

### **Tab-Based Composition Senaryosu**

State view tab'larının dinamik oluşturulması:

```typescript
// TypeScript (Web)
// State view definition'dan tab'lar oluşturulur
const tabs = await stateViewManager.composeTabs(stateView, {
  workflowInstanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1',
  workflowState: 'pending-approval'
});

// Tab yapısı:
// 1. Summary Tab (summary.view)
// 2. History Tab (history: true ise)
// 3. Document Tab (features: ["document"] ise)
// 4. Notes Tab (features: ["notes"] ise)
// 5. Başvuran Bilgileri Tab (groups[0].view)
// 6. Kredi Bilgileri Tab (groups[1].view)
// 7. Belgeler Tab (groups[2].subProcess)
```

```dart
// Dart (Flutter)
// State view definition'dan tab'lar oluşturulur
final tabs = await stateViewManager.composeTabs(stateView, {
  'workflowInstanceId': '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1',
  'workflowState': 'pending-approval'
});
```

### **Sub-Process Integration Senaryosu**

State view içinde alt süreç (sub-process) gösterimi:

```typescript
// TypeScript (Web)
// Belgeler tab'ında contract sub-process gösterilir
const subProcessView = await stateViewManager.loadSubProcessView({
  key: 'contract',
  version: '1.0',
  domain: 'contract',
  flow: 'sys-flow',
  flowVersion: '1.0',
  parentInstanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1'
});

// Sub-process kendi view'ını render eder
// Contract süreci ile ilgili bilgiler gösterilir
```

```dart
// Dart (Flutter)
// Belgeler tab'ında contract sub-process gösterilir
final subProcessView = await stateViewManager.loadSubProcessView(
  key: 'contract',
  version: '1.0',
  domain: 'contract',
  flow: 'sys-flow',
  flowVersion: '1.0',
  parentInstanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1'
);
```

### **Transitions Display Senaryosu**

State view'da transition'ların gösterimi:

```typescript
// TypeScript (Web)
// Summary tab'ında transition'lar gösterilir
const transitions = await stateViewManager.getTransitions({
  workflowInstanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1',
  showFlow: true,      // stateView.summary.transitions.flow
  showShared: true,    // stateView.summary.transitions.shared
  showFeature: true   // stateView.summary.transitions.feature
});

// Transition'lar summary view içinde gösterilir
// Kullanıcı transition'ları tetikleyebilir
```

```dart
// Dart (Flutter)
// Summary tab'ında transition'lar gösterilir
final transitions = await stateViewManager.getTransitions(
  workflowInstanceId: '8398cabd-7dc3-44e8-a8fc-ddbf5a143dd1',
  showFlow: true,
  showShared: true,
  showFeature: true
);
```

## 📚 Public Interface

```typescript
// TypeScript (Web)
interface IStateViewManager {
  // ===== STATE VIEW LOADING =====
  
  loadStateView(options: {
    workflowId: string;
    instanceId: string;
    state: string;
  }): Promise<StateViewDefinition>;
  
  // ===== TAB COMPOSITION =====
  
  composeTabs(
    stateView: StateViewDefinition,
    context: {
      workflowInstanceId: string;
      workflowState: string;
    }
  ): Promise<StateViewTab[]>;
  
  // ===== SUB-PROCESS =====
  
  loadSubProcessView(options: {
    key: string;
    version: string;
    domain: string;
    flow: string;
    flowVersion: string;
    parentInstanceId: string;
  }): Promise<ViewComponent>;
  
  // ===== TRANSITIONS =====
  
  getTransitions(options: {
    workflowInstanceId: string;
    showFlow?: boolean;
    showShared?: boolean;
    showFeature?: boolean;
  }): Promise<Transition[]>;
  
  // ===== SYSTEM COMPONENTS =====
  
  loadHistory(instanceId: string): Promise<HistoryComponent>;
  loadTimeoutInfo(instanceId: string): Promise<TimeoutInfoComponent>;
  
  // ===== FEATURE COMPONENTS =====
  
  loadFeatureComponent(
    feature: string,
    instanceId: string
  ): Promise<ViewComponent>;
  
  // ===== EVENT STREAMS =====
  
  stateViewEvents: Observable<StateViewEvent>;  // RxJS Observable or similar
}
```

```dart
// Dart (Flutter)
abstract class IStateViewManager {
  
  // ===== STATE VIEW LOADING =====
  
  Future<StateViewDefinition> loadStateView({
    required String workflowId,
    required String instanceId,
    required String state
  });
  
  // ===== TAB COMPOSITION =====
  
  Future<List<StateViewTab>> composeTabs(
    StateViewDefinition stateView,
    Map<String, dynamic> context
  );
  
  // ===== SUB-PROCESS =====
  
  Future<Widget> loadSubProcessView({
    required String key,
    required String version,
    required String domain,
    required String flow,
    required String flowVersion,
    required String parentInstanceId
  });
  
  // ===== TRANSITIONS =====
  
  Future<List<Transition>> getTransitions({
    required String workflowInstanceId,
    bool? showFlow,
    bool? showShared,
    bool? showFeature
  });
  
  // ===== SYSTEM COMPONENTS =====
  
  Future<Widget> loadHistory(String instanceId);
  Future<Widget> loadTimeoutInfo(String instanceId);
  
  // ===== FEATURE COMPONENTS =====
  
  Future<Widget> loadFeatureComponent(String feature, String instanceId);
  
  // ===== EVENT STREAMS =====
  
  Stream<StateViewEvent> get stateViewEvents;
}
```

## 🔧 Type Definitions

```typescript
// TypeScript (Web)
interface StateViewDefinition {
  history: boolean;
  features: string[];
  summary: SummaryDefinition;
}

interface SummaryDefinition {
  labels: Array<{ label: string; language: string }>;
  view: ViewDefinition;
  timeoutInfo: boolean;
  transitions: {
    flow: boolean;
    shared: boolean;
    feature: boolean;
  };
  groups: GroupDefinition[];
}

interface GroupDefinition {
  labels: Array<{ label: string; language: string }>;
  view?: ViewDefinition;
  subProcess?: SubProcessDefinition;
}

interface SubProcessDefinition {
  key: string;
  version: string;
  domain: string;
  flow: string;
  flowVersion: string;
}

interface ViewDefinition {
  key: string;
  version: string;
  domain: string;
  flow: string;
  flowVersion: string;
}

interface StateViewTab {
  id: string;
  label: string;
  type: 'summary' | 'history' | 'feature' | 'group' | 'subProcess';
  component: ViewComponent;
}

interface Transition {
  id: string;
  label: string;
  type: 'flow' | 'shared' | 'feature';
  enabled: boolean;
}
```

```dart
// Dart (Flutter)
class StateViewDefinition {
  final bool history;
  final List<String> features;
  final SummaryDefinition summary;
}

class SummaryDefinition {
  final List<Label> labels;
  final ViewDefinition view;
  final bool timeoutInfo;
  final TransitionConfig transitions;
  final List<GroupDefinition> groups;
}

class GroupDefinition {
  final List<Label> labels;
  final ViewDefinition? view;
  final SubProcessDefinition? subProcess;
}

class SubProcessDefinition {
  final String key;
  final String version;
  final String domain;
  final String flow;
  final String flowVersion;
}

class ViewDefinition {
  final String key;
  final String version;
  final String domain;
  final String flow;
  final String flowVersion;
}

class StateViewTab {
  final String id;
  final String label;
  final StateViewTabType type;
  final Widget component;
}

enum StateViewTabType {
  summary,
  history,
  feature,
  group,
  subProcess
}

class Transition {
  final String id;
  final String label;
  final TransitionType type;
  final bool enabled;
}

enum TransitionType {
  flow,
  shared,
  feature
}
```

## 🔧 Enum Definitions

```typescript
// TypeScript (Web)
enum StateViewEventType {
  stateViewLoaded = 'stateViewLoaded',
  tabChanged = 'tabChanged',
  transitionTriggered = 'transitionTriggered',
  subProcessLoaded = 'subProcessLoaded'
}
```

```dart
// Dart (Flutter)
enum StateViewEventType {
  stateViewLoaded,
  tabChanged,
  transitionTriggered,
  subProcessLoaded
}
```

## 👥 Tüketiciler

* **Router**: State view navigation isteklerini StateViewManager'a yönlendirir
* **WorkflowManager**: Workflow instance statüsüne göre state view gösterimi
* **Navigation System**: Backend'den gelen state view definition'larını sağlar
* **DynamicViewManager**: State view içindeki custom view'ları render eder
* **DataManager**: State view verilerinin yönetimi ve cache'leme
