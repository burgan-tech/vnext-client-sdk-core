/**
 * WebSocket Mock for Browser
 * 
 * This mocks WebSocket connections in the browser for development/testing.
 * It simulates a WebSocket server that can receive and send messages.
 */

export class MockWebSocket {
  private _url: string;
  private protocols?: string | string[];
  private _readyState: number = WebSocket.CONNECTING;
  private listeners: {
    open: Array<(event: Event) => void>;
    message: Array<(event: MessageEvent) => void>;
    error: Array<(event: Event) => void>;
    close: Array<(event: CloseEvent) => void>;
  } = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  // WebSocket ready states
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // Mock message queue
  private messageQueue: any[] = [];
  private autoConnect: boolean = true;
  private reconnectDelay: number = 1000;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(url: string, protocols?: string | string[]) {
    this._url = url;
    this.protocols = protocols;

    console.log(`🔌 [MockWebSocket] Creating mock WebSocket connection to: ${url}`);

    // Auto-connect after a short delay to simulate connection time
    if (this.autoConnect) {
      setTimeout(() => {
        this.simulateConnect();
      }, 100);
    }
  }

  private simulateConnect(): void {
    if (this._readyState !== WebSocket.CONNECTING) {
      return;
    }

    console.log(`✅ [MockWebSocket] Connected to: ${this._url}`);
    this._readyState = WebSocket.OPEN;

    // Trigger open event
    const openEvent = new Event('open');
    this.listeners.open.forEach((listener) => {
      try {
        listener(openEvent);
      } catch (error) {
        console.error('[MockWebSocket] Error in open listener:', error);
      }
    });

    // Start heartbeat
    this.startHeartbeat();

    // Send queued messages
    this.flushMessageQueue();
  }

  private startHeartbeat(): void {
    // Send periodic ping messages
    this.heartbeatInterval = setInterval(() => {
      if (this._readyState === WebSocket.OPEN) {
        this.simulateMessage({
          type: 'ping',
          timestamp: Date.now(),
        });
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this._readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.simulateMessage(message);
      }
    }
  }

  // Simulate receiving a message from the server
  public simulateMessage(data: any): void {
    if (this._readyState !== WebSocket.OPEN) {
      return;
    }

    const messageData = typeof data === 'string' ? data : JSON.stringify(data);
    const messageEvent = new MessageEvent('message', {
      data: messageData,
    });

    this.listeners.message.forEach((listener) => {
      try {
        listener(messageEvent);
      } catch (error) {
        console.error('[MockWebSocket] Error in message listener:', error);
      }
    });
  }

  // Simulate server sending a welcome message
  public simulateWelcome(): void {
    this.simulateMessage({
      type: 'welcome',
      message: 'Connected to mock WebSocket server',
      timestamp: Date.now(),
    });
  }

  // Simulate server sending a notification
  public simulateNotification(notification: {
    id: string;
    title: string;
    message: string;
    type?: string;
    data?: any;
  }): void {
    this.simulateMessage({
      type: 'notification',
      ...notification,
      timestamp: Date.now(),
    });
  }

  // Simulate server sending workflow update
  public simulateWorkflowUpdate(update: {
    workflowId: string;
    instanceId: string;
    state: string;
    data?: any;
  }): void {
    this.simulateMessage({
      type: 'workflow.update',
      ...update,
      timestamp: Date.now(),
    });
  }

  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: Event | MessageEvent | CloseEvent) => void
  ): void {
    this.listeners[type].push(listener as any);
  }

  removeEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: Event | MessageEvent | CloseEvent) => void
  ): void {
    const index = this.listeners[type].indexOf(listener as any);
    if (index > -1) {
      this.listeners[type].splice(index, 1);
    }
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (this._readyState !== WebSocket.OPEN) {
      console.warn('[MockWebSocket] Cannot send message: WebSocket is not open');
      this.messageQueue.push(data);
      return;
    }

    console.log(`📤 [MockWebSocket] Sending message:`, data);

    // Parse and handle different message types
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Echo back the message (simulate server response)
      if (message.type === 'ping') {
        this.simulateMessage({
          type: 'pong',
          timestamp: Date.now(),
        });
      } else if (message.type === 'subscribe') {
        this.simulateMessage({
          type: 'subscribed',
          topic: message.topic,
          timestamp: Date.now(),
        });
      } else if (message.type === 'unsubscribe') {
        this.simulateMessage({
          type: 'unsubscribed',
          topic: message.topic,
          timestamp: Date.now(),
        });
      } else {
        // Echo back
        this.simulateMessage({
          type: 'echo',
          original: message,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      // Not JSON, just echo back
      this.simulateMessage({
        type: 'echo',
        data: typeof data === 'string' ? data : 'binary',
        timestamp: Date.now(),
      });
    }
  }

  close(code?: number, reason?: string): void {
    if (this._readyState === WebSocket.CLOSED || this._readyState === WebSocket.CLOSING) {
      return;
    }

    console.log(`🔌 [MockWebSocket] Closing connection: ${this._url} (code: ${code || 1000})`);
    this._readyState = WebSocket.CLOSING;
    this.stopHeartbeat();

    setTimeout(() => {
      this._readyState = WebSocket.CLOSED;
      const closeEvent = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || 'Normal closure',
        wasClean: true,
      });

      this.listeners.close.forEach((listener) => {
        try {
          listener(closeEvent);
        } catch (error) {
          console.error('[MockWebSocket] Error in close listener:', error);
        }
      });
    }, 100);
  }

  // Getters
  get CONNECTING(): number {
    return WebSocket.CONNECTING;
  }

  get OPEN(): number {
    return WebSocket.OPEN;
  }

  get CLOSING(): number {
    return WebSocket.CLOSING;
  }

  get CLOSED(): number {
    return WebSocket.CLOSED;
  }

  get url(): string {
    return this._url;
  }

  get protocol(): string {
    return '';
  }

  get readyState(): number {
    return this._readyState;
  }

  get extensions(): string {
    return '';
  }

  get binaryType(): BinaryType {
    return 'blob';
  }

  set binaryType(value: BinaryType) {
    // Mock implementation - no-op
  }
}

/**
 * Setup WebSocket mock in browser
 * Call this in development mode to replace WebSocket with MockWebSocket
 */
export function setupWebSocketMock(): void {
  if (typeof window === 'undefined') {
    return; // Not in browser
  }

  // Store original WebSocket
  const OriginalWebSocket = window.WebSocket;

  // Replace WebSocket with MockWebSocket
  (window as any).WebSocket = MockWebSocket as any;

  console.log('🔌 [MockWebSocket] WebSocket mock enabled');

  // Return function to restore original WebSocket
  return () => {
    (window as any).WebSocket = OriginalWebSocket;
    console.log('🔌 [MockWebSocket] WebSocket mock disabled');
  };
}
