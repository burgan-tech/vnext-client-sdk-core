<template>
  <div class="dashboard">
    <h1>Dashboard</h1>
    
    <div class="section">
      <h2>State Management</h2>
      <input v-model="stateValue" @input="updateState" placeholder="State value" />
      <p>Current state: {{ stateValue }}</p>
    </div>

    <div class="section">
      <h2>API Example</h2>
      <button @click="fetchData" :disabled="apiLoading">
        {{ apiLoading ? 'Loading...' : 'Fetch Data' }}
      </button>
      <pre v-if="apiData">{{ JSON.stringify(apiData, null, 2) }}</pre>
      <p v-if="apiError" class="error">{{ apiError }}</p>
    </div>

    <div class="section">
      <h2>Features</h2>
      <div v-if="featureLoading">Loading features...</div>
      <div v-else>
        <p>Enabled Features: {{ enabledFeatures.length }}</p>
        <ul>
          <li v-for="feature in enabledFeatures" :key="feature.id">
            {{ feature.name }}
          </li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>Router</h2>
      <p>Current Route: {{ currentRoute?.path || 'N/A' }}</p>
      <button @click="navigateToExample">Navigate to Example</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useApi, useState, useFeature, useRouter } from '@vnext/vue';

const { value: stateValue, set: setState } = useState<string>('dashboard.test');
const { get, loading: apiLoading, error: apiError } = useApi();
const { enabledFeatures, loading: featureLoading } = useFeature();
const { currentRoute, navigate } = useRouter();

const apiData = ref<any>(null);

const updateState = (e: Event) => {
  const target = e.target as HTMLInputElement;
  setState(target.value);
};

const fetchData = async () => {
  try {
    const response = await get('/example/data');
    apiData.value = response.data;
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
};

const navigateToExample = () => {
  navigate('/example', { params: { id: '123' } });
};
</script>

<style scoped>
.dashboard {
  max-width: 800px;
}

.section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.section input {
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.section button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.section button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

pre {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
}

.error {
  color: red;
}
</style>

