<template>
  <div class="websocket">
    <h1>WebSocket Example</h1>
    
    <div class="status">
      <p>Status: {{ status }}</p>
      <p>Connected: {{ isConnected ? 'Yes' : 'No' }}</p>
    </div>

    <div class="controls">
      <button @click="connect" :disabled="isConnected || isConnecting">
        Connect
      </button>
      <button @click="disconnect" :disabled="!isConnected">
        Disconnect
      </button>
      <button @click="sendMessage" :disabled="!isConnected">
        Send Message
      </button>
    </div>

    <div class="messages">
      <h2>Messages</h2>
      <div v-for="(msg, index) in messages" :key="index" class="message">
        <strong>{{ msg.type }}:</strong> {{ JSON.stringify(msg.payload) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWebSocket } from '@vnext/vue';

const {
  status,
  isConnected,
  isConnecting,
  messages,
  connect,
  disconnect,
  send,
} = useWebSocket();

const sendMessage = () => {
  send({
    type: 'test',
    payload: { message: 'Hello from Vue!', timestamp: Date.now() },
  });
};
</script>

<style scoped>
.websocket {
  max-width: 800px;
}

.status {
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

.messages {
  padding: 20px;
  background: #f9f9f9;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.message {
  padding: 10px;
  margin-bottom: 10px;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #007bff;
}
</style>

