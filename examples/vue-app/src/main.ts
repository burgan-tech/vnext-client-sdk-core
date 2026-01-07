import { createApp } from 'vue';
import App from './App.vue';
import VNextVuePlugin from '@vnext/vue';
import { router } from './router';

const app = createApp(App);

// Install VNext Vue plugin
app.use(VNextVuePlugin, {
  config: {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
    wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3000',
    environment: import.meta.env.MODE as any,
    debug: import.meta.env.DEV,
  },
});

// Install router
app.use(router);

app.mount('#app');

