/**
 * Workflow Manager Types
 */

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'decision' | 'form' | 'view';
  config?: Record<string, any>;
  next?: string | string[];
  conditions?: WorkflowCondition[];
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
  value: any;
}

export interface WorkflowState {
  workflowId: string;
  currentStep: string;
  status: WorkflowStatus;
  data: Record<string, any>;
  history: WorkflowStepHistory[];
  startedAt?: number;
  completedAt?: number;
}

export interface WorkflowStepHistory {
  stepId: string;
  timestamp: number;
  data?: Record<string, any>;
  result?: 'success' | 'failure' | 'skipped';
}

export interface WorkflowConfig {
  id: string;
  name: string;
  steps: WorkflowStep[];
  initialStep: string;
  onComplete?: (state: WorkflowState) => void | Promise<void>;
  onError?: (error: Error, state: WorkflowState) => void | Promise<void>;
}

export interface WorkflowEvent {
  type: 'start' | 'step' | 'complete' | 'error' | 'cancel';
  workflowId: string;
  stepId?: string;
  data?: Record<string, any>;
  timestamp: number;
}

export interface WorkflowManager {
  start(workflowId: string, initialData?: Record<string, any>): Promise<WorkflowState>;
  next(data?: Record<string, any>): Promise<WorkflowState>;
  previous(): Promise<WorkflowState>;
  goToStep(stepId: string, data?: Record<string, any>): Promise<WorkflowState>;
  pause(): void;
  resume(): void;
  cancel(): void;
  getState(): WorkflowState | undefined;
  getCurrentStep(): WorkflowStep | undefined;
  onEvent(callback: (event: WorkflowEvent) => void): () => void;
}

