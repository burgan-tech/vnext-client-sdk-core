import { createApp } from 'vue';
import App from './App.vue';
import VNextVuePlugin from '@vnext/vue';
import { router } from './router';

// Enable MSW in development
async function enableMocking() {
  if (import.meta.env.DEV) {
    const { worker } = await import('../../../mocks/browser.js');
    await worker.start({
      onUnhandledRequest: 'bypass',
    });
    console.log('🔶 MSW enabled - Mocking API requests');
  }
}

// Start the app after MSW is ready
enableMocking().then(() => {
  const app = createApp(App);

  // Install VNext Vue plugin
  // Only 2 parameters needed: environmentEndpoint and appKey
  // Core SDK will handle the rest (fetching environments, client config, etc.)
  app.use(VNextVuePlugin, {
    environmentEndpoint: import.meta.env.VITE_ENVIRONMENT_ENDPOINT || 
      'http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment',
    appKey: import.meta.env.VITE_APP_KEY || 'web-app',
    defaultStage: import.meta.env.VITE_DEFAULT_STAGE, // Optional
    debug: import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true', // Enable verbose logging in dev mode
  });

  // Install router
  app.use(router);

  app.mount('#app');
});

