/**
 * WebSocket Client
 */

import type {
  WebSocketConfig,
  WebSocketStatus,
  WebSocketMessage,
  WebSocketEvent,
  WebSocketSubscription,
  WebSocketManager,
} from '../types/websocket';
import { EventEmitter } from '../state/event-emitter';

export class WebSocketClient implements WebSocketManager {
  private config: WebSocketConfig;
  private ws: WebSocket | null = null;
  private status: WebSocketStatus = 'disconnected';
  private eventEmitter: EventEmitter;
  private subscriptions: Map<string, Set<(message: WebSocketMessage) => void>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private messageQueue: WebSocketMessage[] = [];

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnect: {
        enabled: true,
        maxAttempts: 5,
        delay: 1000,
        backoff: 'exponential',
        ...config.reconnect,
      },
      heartbeat: {
        enabled: false,
        interval: 30000,
        message: 'ping',
        ...config.heartbeat,
      },
      ...config,
    };
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.status = 'connecting';
    this.emitEvent('reconnect', { type: 'reconnect', timestamp: Date.now() });

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols);

        this.ws.onopen = () => {
          this.status = 'connected';
          this.reconnectAttempts = 0;
          this.emitEvent('open', { type: 'open', timestamp: Date.now() });

          // Start heartbeat if enabled
          if (this.config.heartbeat?.enabled) {
            this.startHeartbeat();
          }

          // Send queued messages
          this.flushMessageQueue();

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.status = 'error';
          this.emitEvent('error', {
            type: 'error',
            data: error,
            timestamp: Date.now(),
          });
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.status = 'disconnected';
          this.stopHeartbeat();
          this.emitEvent('close', {
            type: 'close',
            data: { code: event.code, reason: event.reason },
            timestamp: Date.now(),
          });

          // Attempt reconnect if enabled
          if (this.config.reconnect?.enabled && !event.wasClean) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        this.status = 'error';
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.status = 'disconnected';
  }

  /**
   * Send message
   */
  send<T = any>(message: WebSocketMessage<T>): void {
    const messageWithTimestamp: WebSocketMessage<T> = {
      ...message,
      timestamp: Date.now(),
      id: message.id || `${Date.now()}-${Math.random()}`,
    };

    if (this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(messageWithTimestamp));
    } else {
      // Queue message for later
      this.messageQueue.push(messageWithTimestamp);
      
      // Try to connect if not connected
      if (this.status === 'disconnected') {
        this.connect().catch(console.error);
      }
    }
  }

  /**
   * Subscribe to message type
   */
  subscribe(
    messageType: string,
    callback: (message: WebSocketMessage) => void
  ): WebSocketSubscription {
    if (!this.subscriptions.has(messageType)) {
      this.subscriptions.set(messageType, new Set());
    }

    this.subscriptions.get(messageType)!.add(callback);

    const subscription: WebSocketSubscription = {
      id: `${messageType}-${Date.now()}-${Math.random()}`,
      messageType,
      callback,
      unsubscribe: () => {
        const callbacks = this.subscriptions.get(messageType);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.subscriptions.delete(messageType);
          }
        }
      },
    };

    return subscription;
  }

  /**
   * Get current status
   */
  getStatus(): WebSocketStatus {
    return this.status;
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: (event: WebSocketEvent) => void): () => void {
    return this.eventEmitter.on(event, callback);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      // Notify subscribers
      const callbacks = this.subscriptions.get(message.type);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(message);
          } catch (error) {
            console.error(`Error in WebSocket message handler for ${message.type}:`, error);
          }
        });
      }

      // Emit generic message event
      this.emitEvent('message', {
        type: 'message',
        data: message,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= (this.config.reconnect?.maxAttempts || 5)) {
      this.status = 'disconnected';
      return;
    }

    this.status = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.calculateReconnectDelay();
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  /**
   * Calculate reconnect delay
   */
  private calculateReconnectDelay(): number {
    const baseDelay = this.config.reconnect?.delay || 1000;
    const backoff = this.config.reconnect?.backoff || 'exponential';

    if (backoff === 'exponential') {
      return baseDelay * Math.pow(2, this.reconnectAttempts - 1);
    }

    return baseDelay;
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    if (!this.config.heartbeat?.enabled) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.status === 'connected') {
        this.send({
          type: this.config.heartbeat!.message || 'ping',
        });
      }
    }, this.config.heartbeat.interval || 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.status === 'connected') {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  /**
   * Emit event
   */
  private emitEvent(type: WebSocketEvent['type'], event: Partial<WebSocketEvent>): void {
    this.eventEmitter.emit(type, event as WebSocketEvent);
    this.eventEmitter.emit('*', event as WebSocketEvent);
  }
}

