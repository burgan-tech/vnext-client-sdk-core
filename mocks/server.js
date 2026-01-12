#!/usr/bin/env node

/**
 * Standalone Mock Server
 * Express-based HTTP server for mocking API endpoints
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.MOCK_PORT || 3001;
const app = express();

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, If-None-Match');
  res.header('Access-Control-Expose-Headers', 'ETag');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Middleware
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, If-None-Match');
  res.header('Access-Control-Expose-Headers', 'ETag');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ETag storage
const functionETags = new Map();

// Helper to generate ETag
function generateETag() {
  return `"${Date.now()}-${Math.random().toString(36).substring(2, 9)}"`;
}

// Load mock data
const environments = JSON.parse(
  readFileSync(join(__dirname, '../docs/sample-service-responses/environments.json'), 'utf8')
);

const clientFunctionConfig = JSON.parse(
  readFileSync(join(__dirname, '../docs/sample-service-responses/client-function-config.json'), 'utf8')
);

// ===== ENVIRONMENTS (Tenant: discovery) =====
app.get('/api/v1/discovery/workflows/enviroment/instances/:appKey/functions/enviroment', (req, res) => {
  const { appKey } = req.params;
  const functionKey = `discovery:enviroment:${appKey}:enviroment`;
  
  // Get or create ETag
  let etag = functionETags.get(functionKey);
  if (!etag) {
    etag = generateETag();
    functionETags.set(functionKey, etag);
  }
  
  // Check ETag
  const ifNoneMatch = req.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return res.status(304).end();
  }
  
  // Return environments
  res.set('ETag', etag);
  res.json(environments);
});

// ===== CLIENT CONFIG (Tenant: morph-idm) =====
app.get('/api/v1/morph-idm/workflows/client/instances/:appKey/functions/client', (req, res) => {
  const { appKey } = req.params;
  const functionKey = `morph-idm:client:${appKey}:client`;
  
  // Get or create ETag
  let etag = functionETags.get(functionKey);
  if (!etag) {
    etag = generateETag();
    functionETags.set(functionKey, etag);
  }
  
  // Check ETag
  const ifNoneMatch = req.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return res.status(304).end();
  }
  
  // Return client config
  res.set('ETag', etag);
  res.json(clientFunctionConfig);
});

// ===== LEGACY ENDPOINTS (for backward compatibility) =====
app.get('/environments.json', (req, res) => {
  res.json(environments);
});

app.get('/client/config', (req, res) => {
  res.json(clientFunctionConfig);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🔶 Mock Server running on http://localhost:' + PORT);
  console.log('\n📋 Available Endpoints:');
  console.log('   GET  /api/v1/discovery/workflows/enviroment/instances/{appKey}/functions/enviroment');
  console.log('   GET  /api/v1/morph-idm/workflows/client/instances/{appKey}/functions/client');
  console.log('   GET  /environments.json (legacy)');
  console.log('   GET  /client/config (legacy)');
  console.log('   GET  /health');
  console.log('\n💡 Test with:');
  console.log(`   curl http://localhost:${PORT}/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment`);
  console.log(`   curl http://localhost:${PORT}/api/v1/morph-idm/workflows/client/instances/web-app/functions/client`);
  console.log('\nPress Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down mock server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Shutting down mock server...');
  process.exit(0);
});
