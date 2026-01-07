/**
 * useWorkflow Hook
 */

import { ref, computed, onUnmounted } from 'vue';
import type { WorkflowState, WorkflowStep, WorkflowEvent } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useWorkflow() {
  const sdk = useVNextSDK();
  const state = ref<WorkflowState | undefined>(sdk.workflow.getState());
  const loading = ref(false);

  const currentStep = computed<WorkflowStep | undefined>(() => sdk.workflow.getCurrentStep());
  const isRunning = computed(() => state.value?.status === 'running');
  const isPaused = computed(() => state.value?.status === 'paused');
  const isCompleted = computed(() => state.value?.status === 'completed');

  // Subscribe to workflow events
  const unsubscribe = sdk.workflow.onEvent((event: WorkflowEvent) => {
    state.value = sdk.workflow.getState();
  });

  onUnmounted(() => {
    unsubscribe();
  });

  const start = async (workflowId: string, initialData?: Record<string, any>) => {
    loading.value = true;
    try {
      const newState = await sdk.workflow.start(workflowId, initialData);
      state.value = newState;
      return newState;
    } finally {
      loading.value = false;
    }
  };

  const next = async (data?: Record<string, any>) => {
    loading.value = true;
    try {
      const newState = await sdk.workflow.next(data);
      state.value = newState;
      return newState;
    } finally {
      loading.value = false;
    }
  };

  const previous = async () => {
    loading.value = true;
    try {
      const newState = await sdk.workflow.previous();
      state.value = newState;
      return newState;
    } finally {
      loading.value = false;
    }
  };

  const goToStep = async (stepId: string, data?: Record<string, any>) => {
    loading.value = true;
    try {
      const newState = await sdk.workflow.goToStep(stepId, data);
      state.value = newState;
      return newState;
    } finally {
      loading.value = false;
    }
  };

  const pause = () => {
    sdk.workflow.pause();
  };

  const resume = () => {
    sdk.workflow.resume();
  };

  const cancel = () => {
    sdk.workflow.cancel();
    state.value = undefined;
  };

  return {
    state: computed(() => state.value),
    currentStep,
    isRunning,
    isPaused,
    isCompleted,
    loading,
    start,
    next,
    previous,
    goToStep,
    pause,
    resume,
    cancel,
  };
}

