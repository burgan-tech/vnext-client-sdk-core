/**
 * WebSocket Types
 */

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  reconnect?: {
    enabled: boolean;
    maxAttempts?: number;
    delay?: number;
    backoff?: 'linear' | 'exponential';
  };
  heartbeat?: {
    enabled: boolean;
    interval?: number;
    message?: string;
  };
}

export interface WebSocketMessage<T = any> {
  type: string;
  payload?: T;
  timestamp?: number;
  id?: string;
}

export interface WebSocketEvent {
  type: 'open' | 'message' | 'error' | 'close' | 'reconnect';
  data?: any;
  timestamp: number;
}

export interface WebSocketSubscription {
  id: string;
  messageType: string;
  callback: (message: WebSocketMessage) => void;
  unsubscribe: () => void;
}

export interface WebSocketManager {
  connect(): Promise<void>;
  disconnect(): void;
  send<T = any>(message: WebSocketMessage<T>): void;
  subscribe(messageType: string, callback: (message: WebSocketMessage) => void): WebSocketSubscription;
  getStatus(): WebSocketStatus;
  on(event: string, callback: (event: WebSocketEvent) => void): () => void;
}

