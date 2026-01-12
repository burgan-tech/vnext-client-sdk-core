<template>
  <div v-if="show" class="stage-selection-overlay" @click.self="handleCancel">
    <div class="stage-selection-dialog">
      <div class="dialog-header">
        <h2>Select Environment</h2>
        <p>Choose the environment you want to use</p>
      </div>
      
      <div class="dialog-body">
        <div 
          v-for="stage in stages" 
          :key="stage.id"
          class="stage-option"
          :class="{ selected: selectedStageId === stage.id }"
          @click="selectedStageId = stage.id"
        >
          <div class="stage-radio">
            <input 
              type="radio" 
              :id="`stage-${stage.id}`"
              :value="stage.id"
              v-model="selectedStageId"
            />
            <label :for="`stage-${stage.id}`">
              <strong>{{ stage.name }}</strong>
              <span class="stage-id">{{ stage.id }}</span>
            </label>
          </div>
        </div>
      </div>
      
      <div class="dialog-footer">
        <button @click="handleCancel" class="btn-cancel">Cancel</button>
        <button @click="handleConfirm" class="btn-confirm" :disabled="!selectedStageId">
          Continue
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Stage {
  id: string;
  name: string;
}

interface Props {
  stages: Stage[];
  show: boolean;
}

interface Emits {
  (e: 'confirm', stageId: string): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedStageId = ref<string>('');

onMounted(() => {
  // Select first stage by default
  if (props.stages.length > 0) {
    selectedStageId.value = props.stages[0].id;
  }
});

const handleConfirm = () => {
  if (selectedStageId.value) {
    emit('confirm', selectedStageId.value);
  }
};

const handleCancel = () => {
  emit('cancel');
};
</script>

<style scoped>
.stage-selection-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.stage-selection-dialog {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
}

.dialog-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: #333;
}

.dialog-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.dialog-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.stage-option {
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.stage-option:hover {
  border-color: #007bff;
  background: #f8f9fa;
}

.stage-option.selected {
  border-color: #007bff;
  background: #e7f3ff;
}

.stage-radio {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stage-radio input[type="radio"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.stage-radio label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  flex: 1;
}

.stage-radio label strong {
  font-size: 16px;
  color: #333;
}

.stage-id {
  font-size: 12px;
  color: #666;
  font-family: monospace;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel,
.btn-confirm {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f5f5f5;
  color: #333;
}

.btn-cancel:hover {
  background: #e0e0e0;
}

.btn-confirm {
  background: #007bff;
  color: white;
}

.btn-confirm:hover:not(:disabled) {
  background: #0056b3;
}

.btn-confirm:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
