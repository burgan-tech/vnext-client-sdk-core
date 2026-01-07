/**
 * Workflow Manager
 */

import type {
  WorkflowConfig,
  WorkflowState,
  WorkflowStep,
  WorkflowStatus,
  WorkflowEvent,
  WorkflowManager as IWorkflowManager,
} from '../types/workflow';
import type { ApiClient } from '../api';
import type { StateStore } from '../state';
import type { WebSocketClient } from '../websocket';
import { EventEmitter } from '../state/event-emitter';

export class WorkflowManager implements IWorkflowManager {
  private currentState: WorkflowState | undefined;
  private workflows: Map<string, WorkflowConfig> = new Map();
  private eventEmitter: EventEmitter;
  private wsSubscription?: { unsubscribe: () => void };

  constructor(
    private apiClient: ApiClient,
    private stateStore: StateStore,
    private wsClient?: WebSocketClient
  ) {
    this.eventEmitter = new EventEmitter();

    // Subscribe to WebSocket workflow events if available
    if (this.wsClient) {
      this.wsSubscription = this.wsClient.subscribe('workflow', (message) => {
        this.handleWorkflowMessage(message);
      });
    }
  }

  /**
   * Start workflow
   */
  async start(workflowId: string, initialData?: Record<string, any>): Promise<WorkflowState> {
    try {
      // Fetch workflow config from backend
      const configResponse = await this.apiClient.get<WorkflowConfig>(`/workflows/${workflowId}`);
      const config = configResponse.data;
      this.workflows.set(workflowId, config);

      // Start workflow on backend
      const startResponse = await this.apiClient.post<WorkflowState>(
        `/workflows/${workflowId}/start`,
        { initialData }
      );

      this.currentState = startResponse.data;
      this.stateStore.set('workflow.current', this.currentState);

      this.emitEvent('start', {
        workflowId,
        stepId: this.currentState.currentStep,
        data: initialData,
      });

      return this.currentState;
    } catch (error) {
      console.error('Failed to start workflow:', error);
      throw error;
    }
  }

  /**
   * Move to next step
   */
  async next(data?: Record<string, any>): Promise<WorkflowState> {
    if (!this.currentState) {
      throw new Error('No active workflow');
    }

    try {
      const response = await this.apiClient.post<WorkflowState>(
        `/workflows/${this.currentState.workflowId}/next`,
        { data }
      );

      this.currentState = response.data;
      this.stateStore.set('workflow.current', this.currentState);

      this.emitEvent('step', {
        workflowId: this.currentState.workflowId,
        stepId: this.currentState.currentStep,
        data,
      });

      return this.currentState;
    } catch (error) {
      console.error('Failed to move to next step:', error);
      throw error;
    }
  }

  /**
   * Move to previous step
   */
  async previous(): Promise<WorkflowState> {
    if (!this.currentState) {
      throw new Error('No active workflow');
    }

    try {
      const response = await this.apiClient.post<WorkflowState>(
        `/workflows/${this.currentState.workflowId}/previous`,
        {}
      );

      this.currentState = response.data;
      this.stateStore.set('workflow.current', this.currentState);

      this.emitEvent('step', {
        workflowId: this.currentState.workflowId,
        stepId: this.currentState.currentStep,
      });

      return this.currentState;
    } catch (error) {
      console.error('Failed to move to previous step:', error);
      throw error;
    }
  }

  /**
   * Go to specific step
   */
  async goToStep(stepId: string, data?: Record<string, any>): Promise<WorkflowState> {
    if (!this.currentState) {
      throw new Error('No active workflow');
    }

    try {
      const response = await this.apiClient.post<WorkflowState>(
        `/workflows/${this.currentState.workflowId}/goto`,
        { stepId, data }
      );

      this.currentState = response.data;
      this.stateStore.set('workflow.current', this.currentState);

      this.emitEvent('step', {
        workflowId: this.currentState.workflowId,
        stepId,
        data,
      });

      return this.currentState;
    } catch (error) {
      console.error('Failed to go to step:', error);
      throw error;
    }
  }

  /**
   * Pause workflow
   */
  pause(): void {
    if (!this.currentState) return;

    this.currentState.status = 'paused';
    this.stateStore.set('workflow.current', this.currentState);
    this.eventEmitter.emit('paused', this.currentState);
  }

  /**
   * Resume workflow
   */
  resume(): void {
    if (!this.currentState) return;

    this.currentState.status = 'running';
    this.stateStore.set('workflow.current', this.currentState);
    this.eventEmitter.emit('resumed', this.currentState);
  }

  /**
   * Cancel workflow
   */
  cancel(): void {
    if (!this.currentState) return;

    this.currentState.status = 'cancelled';
    this.stateStore.set('workflow.current', this.currentState);

    this.emitEvent('cancel', {
      workflowId: this.currentState.workflowId,
    });

    this.currentState = undefined;
    this.stateStore.delete('workflow.current');
  }

  /**
   * Get current workflow state
   */
  getState(): WorkflowState | undefined {
    return this.currentState || this.stateStore.get<WorkflowState>('workflow.current');
  }

  /**
   * Get current step
   */
  getCurrentStep(): WorkflowStep | undefined {
    if (!this.currentState) return undefined;

    const config = this.workflows.get(this.currentState.workflowId);
    if (!config) return undefined;

    return config.steps.find(step => step.id === this.currentState!.currentStep);
  }

  /**
   * Subscribe to workflow events
   */
  onEvent(callback: (event: WorkflowEvent) => void): () => void {
    return this.eventEmitter.on('*', callback);
  }

  /**
   * Handle WebSocket workflow message
   */
  private handleWorkflowMessage(message: any): void {
    if (message.payload?.workflowId === this.currentState?.workflowId) {
      // Update state from backend
      if (message.payload?.state) {
        this.currentState = message.payload.state;
        this.stateStore.set('workflow.current', this.currentState);
        if (this.currentState) {
          this.emitEvent('step', {
            workflowId: this.currentState.workflowId,
            stepId: this.currentState.currentStep,
          });
        }
      }
    }
  }

  /**
   * Emit workflow event
   */
  private emitEvent(
    type: WorkflowEvent['type'],
    data: Partial<WorkflowEvent>
  ): void {
    const event: WorkflowEvent = {
      type,
      workflowId: this.currentState?.workflowId || '',
      ...data,
      timestamp: Date.now(),
    } as WorkflowEvent;

    this.eventEmitter.emit(type, event);
    this.eventEmitter.emit('*', event);
  }
}

