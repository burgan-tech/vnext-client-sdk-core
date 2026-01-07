<template>
  <div class="view-example">
    <h1>View Manager Example</h1>
    
    <div class="controls">
      <input v-model="viewId" placeholder="View ID" />
      <button @click="loadView" :disabled="loading">
        {{ loading ? 'Loading...' : 'Load View' }}
      </button>
      <button @click="renderView" :disabled="!definition">
        Render View
      </button>
    </div>

    <div v-if="definition" class="view-info">
      <h2>{{ definition.name }}</h2>
      <pre>{{ JSON.stringify(definition, null, 2) }}</pre>
    </div>

    <div id="view-container" class="view-container"></div>

    <div v-if="data" class="view-data">
      <h3>View Data</h3>
      <pre>{{ JSON.stringify(data, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useView } from '@vnext/vue';

const viewId = ref('example-view');
const { definition, data, loading, load, render, updateData } = useView(viewId.value);

const loadView = async () => {
  await load(viewId.value);
};

const renderView = async () => {
  await render('#view-container');
};
</script>

<style scoped>
.view-example {
  max-width: 1000px;
}

.controls {
  margin-bottom: 20px;
}

.controls input {
  padding: 8px;
  margin-right: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
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

.view-info {
  margin-bottom: 20px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 4px;
}

.view-container {
  min-height: 200px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 20px;
}

.view-data {
  padding: 20px;
  background: #f0f0f0;
  border-radius: 4px;
}

pre {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
}
</style>

