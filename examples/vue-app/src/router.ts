import { createRouter, createWebHistory } from 'vue-router';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import WebSocket from './views/WebSocket.vue';
import Workflow from './views/Workflow.vue';
import View from './views/View.vue';

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login },
  { path: '/dashboard', component: Dashboard },
  { path: '/websocket', component: WebSocket },
  { path: '/workflow', component: Workflow },
  { path: '/view', component: View },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

