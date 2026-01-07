<template>
  <div id="app">
    <nav>
      <router-link to="/login">Login</router-link>
      <router-link to="/dashboard">Dashboard</router-link>
      <router-link to="/websocket">WebSocket</router-link>
      <router-link to="/workflow">Workflow</router-link>
      <router-link to="/view">View</router-link>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<style>
#app {
  font-family: Arial, sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

nav {
  margin-bottom: 20px;
  padding: 10px;
  background: #f0f0f0;
  border-radius: 4px;
}

nav a {
  margin-right: 10px;
  padding: 5px 10px;
  text-decoration: none;
  color: #333;
}

nav a:hover {
  background: #ddd;
  border-radius: 2px;
}

main {
  padding: 20px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
</style>

