/**
 * useWebSocket Hook
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { WebSocketStatus, WebSocketMessage, WebSocketSubscription } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useWebSocket() {
  const sdk = useVNextSDK();
  
  if (!sdk.websocket) {
    throw new Error('WebSocket is not enabled. Make sure to enable it in SDK config.');
  }

  const status = ref<WebSocketStatus>(sdk.websocket.getStatus());
  const messages = ref<WebSocketMessage[]>([]);
  const subscriptions = ref<Map<string, WebSocketSubscription>>(new Map());

  const isConnected = computed(() => status.value === 'connected');
  const isConnecting = computed(() => status.value === 'connecting');
  const isDisconnected = computed(() => status.value === 'disconnected');

  // Watch status changes
  const statusUnsubscribe = sdk.websocket.on('open', () => {
    status.value = 'connected';
  });

  sdk.websocket.on('close', () => {
    status.value = 'disconnected';
  });

  sdk.websocket.on('error', () => {
    status.value = 'error';
  });

  const connect = async () => {
    await sdk.websocket!.connect();
    status.value = sdk.websocket!.getStatus();
  };

  const disconnect = () => {
    sdk.websocket!.disconnect();
    status.value = sdk.websocket!.getStatus();
  };

  const send = <T = any>(message: WebSocketMessage<T>) => {
    sdk.websocket!.send(message);
  };

  const subscribe = (messageType: string, callback: (message: WebSocketMessage) => void) => {
    const subscription = sdk.websocket!.subscribe(messageType, (message) => {
      messages.value.push(message);
      callback(message);
    });
    subscriptions.value.set(messageType, subscription);
    return subscription;
  };

  onUnmounted(() => {
    subscriptions.value.forEach(sub => sub.unsubscribe());
    statusUnsubscribe();
  });

  return {
    status,
    isConnected,
    isConnecting,
    isDisconnected,
    messages,
    connect,
    disconnect,
    send,
    subscribe,
  };
}

