# WorkflowManager

> **Not:** Bu dokümantasyon hem TypeScript (web) hem de Flutter (mobil) platformlarında kullanılacak core SDK için generic bir yaklaşım sunar. Platform-specific implementasyonlar (Vue/React component'ları veya Flutter widget'ları) adapter katmanında gerçekleştirilir.

WorkflowManager, iş akışlarının lifecycle yönetimini sağlayan core SDK sınıfıdır.

## 🎯 Temel Amaç

İş akışlarının başlatılması, transition yönetimi, instance lifecycle'ı ve Router + DataManager koordinasyonunu sağlamak. Navigation'da `"type": "workflow"` olarak tanımlanmış öğelerin client-side implementasyonunu gerçekleştirir.

**Önemli:** Workflow sayfaları navigation history'sine dahil edilmez ("No Workflow History" kuralı). Workflow içindeki sayfa geçişleri WorkflowManager tarafından yönetilir.

## 🚀 Temel Sunduğu Hizmetler

* **Workflow Lifecycle**: İş akışlarının başlatılması, devam ettirilmesi ve sonlandırılması
* **Backend-Driven Transitions**: İş akışı adımları arasındaki geçişler backend tarafından yönetilir (next state backend'den gelir)
* **State Management**: Workflow state'inin DataManager ile saklanması ve yönetimi
* **WebSocket Integration**: Real-time workflow state güncellemeleri (WebSocket ile)
* **Router Integration**: Router ile workflow sayfalarının navigasyon yönetimi
* **No History Rule**: Workflow sayfaları navigation history'sine dahil edilmez

## 💡 Kullanım Senaryoları

### **Workflow Başlatma Senaryosu**

```typescript
// TypeScript (Web)
// Para transfer iş akışını başlat (Navigation'dan gelen config ile)
const state = await workflowManager.start('money-transfer-workflow', {
  sourceAccount: 'TR123456789',
  amount: 1000.0
});

// Workflow state DataManager'a kaydedilir
// Router workflow sayfasını gösterir (history'ye eklenmez)
```

```dart
// Dart (Flutter)
// Para transfer iş akışını başlat (Navigation'dan gelen config ile)
final state = await workflowManager.start('money-transfer-workflow', {
  'sourceAccount': 'TR123456789',
  'amount': 1000.0
});

// Workflow state DataManager'a kaydedilir
// Router workflow sayfasını gösterir (history'ye eklenmez)
```

### **Backend-Driven Transition Senaryosu**

Workflow adımları arasındaki geçişler backend tarafından yönetilir:

```typescript
// TypeScript (Web)
// Kullanıcı form'u doldurur ve "İleri" butonuna basar
const nextState = await workflowManager.next({
  accountNumber: 'TR123456789',
  amount: 1000.0,
  recipient: 'John Doe'
});

// Backend next state'i döner:
// {
//   workflowId: 'money-transfer-workflow',
//   currentStep: 'confirmation',
//   status: 'running',
//   data: { ... }
// }

// WorkflowManager state'i günceller ve Router'a yeni sayfayı gösterir
```

```dart
// Dart (Flutter)
// Kullanıcı form'u doldurur ve "İleri" butonuna basar
final nextState = await workflowManager.next({
  'accountNumber': 'TR123456789',
  'amount': 1000.0,
  'recipient': 'John Doe'
});

// Backend next state'i döner ve WorkflowManager state'i günceller
```

### **WebSocket Real-Time Update Senaryosu**

Workflow state'i WebSocket ile real-time güncellenebilir:

```typescript
// TypeScript (Web)
// WebSocket'ten workflow state güncellemesi gelir
workflowManager.onEvent((event) => {
  if (event.type === 'step') {
    // Backend'den yeni step geldi
    // Router otomatik olarak yeni sayfayı gösterir
    console.log('Workflow step changed:', event.stepId);
  }
});
```

```dart
// Dart (Flutter)
// WebSocket'ten workflow state güncellemesi gelir
workflowManager.onEvent((event) {
  if (event.type == 'step') {
    // Backend'den yeni step geldi
    // Router otomatik olarak yeni sayfayı gösterir
    print('Workflow step changed: ${event.stepId}');
  }
});
```

## 📚 Public Interface

```typescript
// TypeScript (Web)
interface IWorkflowManager {
  // ===== WORKFLOW LIFECYCLE =====
  
  start(workflowId: string, initialData?: Record<string, any>): Promise<WorkflowState>;
  next(data?: Record<string, any>): Promise<WorkflowState>;
  previous(): Promise<WorkflowState>;
  goToStep(stepId: string, data?: Record<string, any>): Promise<WorkflowState>;
  pause(): void;
  resume(): void;
  cancel(): void;
  
  // ===== STATE QUERIES =====
  
  getState(): WorkflowState | undefined;
  getCurrentStep(): WorkflowStep | undefined;
  
  // ===== EVENT STREAMS =====
  
  onEvent(callback: (event: WorkflowEvent) => void): () => void;  // Returns unsubscribe function
}
```

```dart
// Dart (Flutter)
abstract class IWorkflowManager {
  
  // ===== WORKFLOW LIFECYCLE =====
  
  Future<WorkflowState> start(String workflowId, {Map<String, dynamic>? initialData});
  Future<WorkflowState> next({Map<String, dynamic>? data});
  Future<WorkflowState> previous();
  Future<WorkflowState> goToStep(String stepId, {Map<String, dynamic>? data});
  void pause();
  void resume();
  void cancel();
  
  // ===== STATE QUERIES =====
  
  WorkflowState? getState();
  WorkflowStep? getCurrentStep();
  
  // ===== EVENT STREAMS =====
  
  StreamSubscription<WorkflowEvent> onEvent(void Function(WorkflowEvent) callback);
}
```

## 🔧 Enum Definitions

```typescript
// TypeScript (Web)
type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

type WorkflowEventType = 'start' | 'step' | 'complete' | 'error' | 'cancel';

interface WorkflowState {
  workflowId: string;
  currentStep: string;
  status: WorkflowStatus;
  data: Record<string, any>;
  history: WorkflowStepHistory[];
  startedAt?: number;
  completedAt?: number;
}

interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'decision' | 'form' | 'view';
  config?: Record<string, any>;
  next?: string | string[];
  conditions?: WorkflowCondition[];
}

interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  stepId?: string;
  data?: Record<string, any>;
  timestamp: number;
}
```

```dart
// Dart (Flutter)
enum WorkflowStatus {
  idle,
  running,
  paused,
  completed,
  failed,
  cancelled
}

enum WorkflowEventType {
  start,
  step,
  complete,
  error,
  cancel
}

class WorkflowState {
  final String workflowId;
  final String currentStep;
  final WorkflowStatus status;
  final Map<String, dynamic> data;
  final List<WorkflowStepHistory> history;
  final int? startedAt;
  final int? completedAt;
}

class WorkflowStep {
  final String id;
  final String name;
  final String type;  // 'action' | 'decision' | 'form' | 'view'
  final Map<String, dynamic>? config;
  final String? next;
  final List<String>? nextOptions;
  final List<WorkflowCondition>? conditions;
}

class WorkflowEvent {
  final WorkflowEventType type;
  final String workflowId;
  final String? stepId;
  final Map<String, dynamic>? data;
  final int timestamp;
}
```
