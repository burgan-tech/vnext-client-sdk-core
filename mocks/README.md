# Mock Server Documentation

## Overview

This project uses **two different mock systems** for different purposes:

### 1. MSW (Mock Service Worker) - Browser-based
- **Location**: `mocks/browser.ts` and `mocks/handlers.ts`
- **Where it runs**: Inside the browser, as part of the Vue app
- **Purpose**: Intercepts HTTP requests made by the Vue app
- **Logs**: Appear in the browser console (F12 → Console)
- **How it works**: 
  - Service Worker intercepts fetch/XMLHttpRequest calls
  - Runs automatically when Vue app starts in development mode
  - Configured in `examples/vue-app/src/main.ts`

### 2. Express Mock Server - Standalone Node.js server
- **Location**: `mocks/server.js`
- **Where it runs**: Separate Node.js process on `localhost:3001`
- **Purpose**: Standalone HTTP server for testing without browser
- **Logs**: Appear in the terminal where you run `npm run mock:server`
- **How it works**:
  - Independent Express.js server
  - Can be accessed from any HTTP client (curl, Postman, etc.)
  - Must be started separately: `npm run mock:server`

## WebSocket Mock

- **Location**: `mocks/websocket.ts`
- **Where it runs**: Inside the browser (replaces native WebSocket)
- **Purpose**: Mocks WebSocket connections for development
- **How it works**:
  - Replaces `window.WebSocket` with `MockWebSocket` class
  - Simulates WebSocket server behavior (connect, send, receive)
  - Automatically enabled in development mode
  - Logs appear in browser console

## Usage

### MSW (Browser Mock)
MSW is automatically enabled when you run the Vue app in development mode:
```bash
cd examples/vue-app
npm run dev
```

You'll see in the browser console:
```
🔶 [VueApp] Enabling MSW mock service worker...
✅ [VueApp] MSW enabled - Mocking API requests
```

### Express Mock Server
Start the standalone server:
```bash
npm run mock:server
```

The server will start on `http://localhost:3001` and show:
```
🔶 Mock Server running on http://localhost:3001
```

### WebSocket Mock
WebSocket mock is automatically enabled in development mode. You'll see:
```
🔶 [VueApp] Enabling WebSocket mock...
✅ [VueApp] WebSocket mock enabled
```

## Which Mock to Use?

- **For Vue app development**: Use MSW (automatic) + WebSocket mock (automatic)
- **For API testing without browser**: Use Express Mock Server
- **For both**: Run both! They don't conflict.

## Mock Features

### MSW Handlers (`mocks/handlers.ts`)
- Environment endpoints
- Client config endpoints
- Auth endpoints (device, 1fa, 2fa, login, refresh)
- Navigation endpoints
- Workflow instance endpoints
- Function endpoints
- Transition endpoints
- ETag support for caching

### Express Server (`mocks/server.js`)
- Same endpoints as MSW
- CORS enabled
- Health check endpoint
- Root endpoint listing all available endpoints

### WebSocket Mock (`mocks/websocket.ts`)
- Auto-connect simulation
- Message echo
- Heartbeat (ping/pong)
- Subscribe/unsubscribe simulation
- Notification simulation
- Workflow update simulation

## Logs Location

- **MSW logs**: Browser console (F12 → Console tab)
- **Express server logs**: Terminal where you ran `npm run mock:server`
- **WebSocket mock logs**: Browser console (look for `[MockWebSocket]` prefix)

## Troubleshooting

### MSW not working?
1. Check browser console for errors
2. Make sure you're in development mode (`import.meta.env.DEV === true`)
3. Check Service Worker registration in DevTools → Application → Service Workers

### Express server not starting?
1. Check if port 3001 is already in use
2. Make sure Node.js is installed
3. Check terminal for error messages

### WebSocket mock not working?
1. Check browser console for `[MockWebSocket]` logs
2. Make sure you're in development mode
3. Check if WebSocket is being used correctly in your code
