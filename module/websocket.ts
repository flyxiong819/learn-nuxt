


export class WebSocketObj {
  /** websocket实例 */
  private websocket: WebSocket | null = null;
  /** 重连的间隔句柄（setInterval) */
  private reconnectInterval?: number;
  /** 重连尝试计数 */
  private reconnectAttempts = 0;
  /** ws的message事件回调，用来暂存，自动重新连接的时候要用 */
  private onMessageCallbackStore?: Function;
  /** ws的error事件回调，用来暂存，自动重新连接的时候要用 */
  private onErrorCallbackStore?: Function;
  /** ws的close事件回调，用来暂存，自动重新连接的时候要用 */
  private onCloseCallbackStore?: Function;

  /** 最多尝试重连次数 */
  private maxReconnectAttempts = 5;
  /** 重连间隔时间 */
  private reconnectDelay = 3000; // Start with 3 seconds
  /** ws的url */
  private currentWsUrl = '';

  constructor(obj?: {
    maxReconnectAttempts?: number;
    reconnectDelay?: number;
    wsUrl?: string;
  }) {
    this.maxReconnectAttempts = obj?.maxReconnectAttempts ?? 5;
    this.reconnectDelay = obj?.reconnectDelay ?? 3000;
    this.currentWsUrl = obj?.wsUrl || window.location.hostname;
  }

  private getWebsocketProtocol() {
    return window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  }

  private getWebsocketURL() {
    // For development with Tailscale, ensure we're using the same hostname
    // that was used to access the main page
    return `${this.getWebsocketProtocol()}${this.currentWsUrl}`;
  }

  // Attempts to reconnect to the WebSocket server
  private reconnectWebsocket() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`Maximum reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection.`);
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = undefined;
      this.reconnectAttempts = 0;
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.connectWebsocket(this.onMessageCallbackStore, this.onErrorCallbackStore, this.onCloseCallbackStore);
  }

  // Connects to the websocket server on a given port and sets up event handlers.
  connectWebsocket(
    onMessageCallback?: Function,
    onErrorCallback?: Function,
    onCloseCallback?: Function,
  ) {
    // Store these for reconnection
    this.onMessageCallbackStore = onMessageCallback;
    this.onErrorCallbackStore = onErrorCallback;
    this.onCloseCallbackStore = onCloseCallback;

    // Clear any existing reconnect intervals
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = undefined;
    }
    
    const url = this.getWebsocketURL();
    console.log("Attempting WebSocket connection to:", url);
    
    // Close existing connection if any
    if (this.websocket && this.websocket.readyState !== WebSocket.CLOSED) {
      this.websocket.close();
    }

    this.websocket = new WebSocket(url);

    this.websocket.binaryType = "arraybuffer"; // blob | arraybuffer

    this.websocket.onopen = () => {
      console.log("WebSocket connected to", url);
      this.reconnectAttempts = 0; // Reset attempts on successful connection
    };

    this.websocket.onmessage = (event) => {
      // Reset reconnect attempts on successful message receipt
      this.reconnectAttempts = 0;
      
      console.log("Message received from server:", event.data);
      try {
        // If we have a callback, call it
        if (onMessageCallback) onMessageCallback(event);
      } catch (e) {
        console.error("Failed to parse WebSocket message as JSON:", e, event.data);
      }
    };

    this.websocket.onerror = (err) => {
      console.error("WebSocket error:", err);
      if (onErrorCallback) onErrorCallback(err);
    };

    this.websocket.onclose = (event) => {
      console.log(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      if (onCloseCallback) onCloseCallback(event);

      // Don't attempt to reconnect if closed normally (1000)
      if (event.code !== 1000 && !this.reconnectInterval) {
        console.log("Setting up reconnection timer...");
        this.reconnectInterval = setInterval(this.reconnectWebsocket.bind(this), this.reconnectDelay);
      }
    };
    
    // Set up a heartbeat to keep the connection alive
    // This sends a small payload every 20 seconds to prevent timeouts
    const heartbeatInterval = setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({ type: "heartbeat" }));
      } else if (this.websocket?.readyState !== WebSocket.CONNECTING) {
        clearInterval(heartbeatInterval);
      }
    }, 20000); // Send heartbeat every 20 seconds
  }

  // Sends a JSON payload over the WebSocket
  sendJSON(payload: any, isNeedStringify = true) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not open. Unable to send message:", payload);
      // Attempt to reconnect if not already in progress
      if (!this.reconnectInterval && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectWebsocket();
      }
      return;
    }
    // console.log("Sending message:", payload);
    if (isNeedStringify) {
      this.websocket.send(JSON.stringify(payload));
    } else {
      this.websocket.send(payload);
    }
  }
}
