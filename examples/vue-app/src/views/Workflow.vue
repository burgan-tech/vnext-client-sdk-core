<template>
  <div class="workflow">
    <h1>Workflow Example</h1>
    
    <div v-if="!state">
      <button @click="startWorkflow" :disabled="loading">
        Start Workflow
      </button>
    </div>

    <div v-else>
      <div class="workflow-info">
        <p>Workflow ID: {{ state.workflowId }}</p>
        <p>Current Step: {{ state.currentStep }}</p>
        <p>Status: {{ state.status }}</p>
      </div>

      <div class="controls">
        <button @click="nextStep" :disabled="loading || !isRunning">
          Next Step
        </button>
        <button @click="previousStep" :disabled="loading || !isRunning">
          Previous Step
        </button>
        <button @click="pauseWorkflow" :disabled="!isRunning">
          Pause
        </button>
        <button @click="resumeWorkflow" :disabled="!isPaused">
          Resume
        </button>
        <button @click="cancelWorkflow">
          Cancel
        </button>
      </div>

      <div v-if="currentStep" class="step-info">
        <h3>{{ currentStep.name }}</h3>
        <p>Type: {{ currentStep.type }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorkflow } from '@vnext/vue';

const {
  state,
  currentStep,
  isRunning,
  isPaused,
  loading,
  start,
  next,
  previous,
  pause,
  resume,
  cancel,
} = useWorkflow();

const startWorkflow = async () => {
  await start('example-workflow', { initialData: 'test' });
};

const nextStep = async () => {
  await next({ data: 'next' });
};

const previousStep = async () => {
  await previous();
};

const pauseWorkflow = () => {
  pause();
};

const resumeWorkflow = () => {
  resume();
};

const cancelWorkflow = () => {
  cancel();
};
</script>

<style scoped>
.workflow {
  max-width: 800px;
}

.workflow-info {
  padding: 20px;
  background: #f0f0f0;
  border-radius: 4px;
  margin-bottom: 20px;
}

.controls {
  margin-bottom: 20px;
}

.controls button {
  margin-right: 10px;
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.controls button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.step-info {
  padding: 20px;
  background: #e7f3ff;
  border-radius: 4px;
}
</style>

