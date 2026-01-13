# Stage Config Schema Documentation

## Overview

Backend always returns stage configuration information in a standardized schema. This schema is used for building function call URLs according to Swagger API patterns.

## Stage Config Schema

When a stage is provided in `environments.json`, backend returns the following structure:

```json
{
  "stages": [
    {
      "key": "localhost",
      "title": "Local Development",
      "baseUrl": "http://localhost:3001/api/v1/",
      "wsUrl": "ws://localhost:3001",
      "mqttUrl": "mqtt://localhost:1883",
      "config": {
        "_comment": "http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/localhost/functions/enviroment",
        "level": "instance",
        "domain": "discovery",
        "workflow": "enviroment",
        "instanceKey": "localhost",
        "function": "enviroment"
      }
    }
  ]
}
```

## Field Descriptions

### Stage Fields

#### `key` (required)
- **Type**: `string`
- **Description**: Stage identifier (replaces legacy `id` field)
- **Example**: `"localhost"`, `"pilot"`, `"prod"`

#### `title` (required)
- **Type**: `string`
- **Description**: Stage display name (replaces legacy `name` field)
- **Example**: `"Local Development"`, `"Pilot Environment"`

#### `baseUrl` (required)
- **Type**: `string`
- **Description**: Base URL for API calls. May include `/api/v1/` suffix
- **Example**: `"http://localhost:3001/api/v1/"` or `"https://api.example.com"`

#### `wsUrl` (optional)
- **Type**: `string`
- **Description**: WebSocket URL
- **Example**: `"ws://localhost:3001"`, `"wss://ws.example.com"`

#### `mqttUrl` (optional)
- **Type**: `string`
- **Description**: MQTT URL
- **Example**: `"mqtt://localhost:1883"`, `"mqtts://mqtt.example.com:8883"`

#### `config` (required)
- **Type**: `StageConfig` object
- **Description**: Configuration object for building function call URLs
- **Replaces**: Legacy `configEndpoint` string field
- **Note**: Client builds URL from this object following Swagger pattern

### Config Object Fields

#### `level` (required)
- **Type**: `string`
- **Description**: Function call level
- **Example**: `"instance"`

#### `domain` (required)
- **Type**: `string`
- **Description**: Domain identifier for the function call
- **Example**: `"discovery"`, `"morph-idm"`

#### `workflow` (required)
- **Type**: `string`
- **Description**: Workflow name
- **Example**: `"enviroment"`, `"client"`

#### `instanceKey` (required)
- **Type**: `string`
- **Description**: Instance key (typically matches stage `key`)
- **Example**: `"localhost"`, `"pilot"`

#### `function` (required)
- **Type**: `string`
- **Description**: Function name
- **Example**: `"enviroment"`, `"client"`

#### `_comment` (optional, ignored by SDK)
- **Type**: `string`
- **Description**: Reference comment showing the built URL (for documentation purposes only)
- **Note**: This field is **completely ignored** by SDK and applications. It exists only for human reference.
- **Example**: `"http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/localhost/functions/enviroment"`

## URL Construction

The client builds function call URLs according to the Swagger API pattern:

```
{baseUrl}/api/v1/{domain}/workflows/{workflow}/instances/{instanceKey}/functions/{function}
```

### BaseUrl Handling

The `baseUrl` may or may not include `/api/v1/` suffix:

- **If baseUrl includes `/api/v1/`**: Use as is
  - Example: `"http://localhost:3001/api/v1/"` → Use directly
- **If baseUrl doesn't include `/api/v1/`**: Add it
  - Example: `"https://api.example.com"` → Add `/api/v1/`

### Example 1: baseUrl with /api/v1/

Given:
```json
{
  "baseUrl": "http://localhost:3001/api/v1/",
  "config": {
    "domain": "discovery",
    "workflow": "enviroment",
    "instanceKey": "localhost",
    "function": "enviroment"
  }
}
```

Built URL:
```
http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/localhost/functions/enviroment
```

### Example 2: baseUrl without /api/v1/

Given:
```json
{
  "baseUrl": "https://api.example.com",
  "config": {
    "domain": "discovery",
    "workflow": "enviroment",
    "instanceKey": "pilot",
    "function": "enviroment"
  }
}
```

Built URL:
```
https://api.example.com/api/v1/discovery/workflows/enviroment/instances/pilot/functions/enviroment
```

## Swagger Compliance

This schema follows the backend Swagger API specification:

- **Endpoint Pattern**: `/api/v1/{domain}/workflows/{workflow}/instances/{instanceKey}/functions/{function}`
- **Method**: `GET`
- **ETag Support**: Function responses support ETag for caching

## Migration from Legacy Format

### Legacy Format
```json
{
  "id": "localhost",
  "name": "Local Development",
  "configEndpoint": "http://localhost:3001/client/config"
}
```

### New Format
```json
{
  "key": "localhost",
  "title": "Local Development",
  "config": {
    "level": "instance",
    "domain": "discovery",
    "workflow": "enviroment",
    "instanceKey": "localhost",
    "function": "enviroment"
  }
}
```

### SDK Compatibility

The SDK supports both formats for backward compatibility:
- `id` or `key` for stage identifier
- `name` or `title` for stage display name
- `configEndpoint` (string) or `config` (object) for configuration

## Usage in SDK

### Fetching Client Config

```typescript
// SDK automatically builds URL from stage.config object
const config = stage.config;
const baseUrl = stage.baseUrl.replace(/\/$/, '');

// Handle baseUrl with or without /api/v1/
const normalizedBaseUrl = baseUrl.includes('/api/v1') 
  ? baseUrl 
  : `${baseUrl}/api/v1`;

// Build URL following Swagger pattern
const configUrl = `${normalizedBaseUrl}/${config.domain}/workflows/${config.workflow}/instances/${config.instanceKey}/functions/${config.function}`;

// Fetch config
const response = await fetch(configUrl);
```

## Important Notes

1. **`_comment` is ignored**: The `_comment` field is for documentation/reference only. SDK and applications completely ignore it.

2. **URL is built by client**: The client constructs the URL from the config object components, following Swagger patterns. No hardcoded endpoints.

3. **Swagger compliance**: The schema structure ensures compatibility with backend Swagger API specifications.

4. **Flexible baseUrl**: The baseUrl can include or exclude `/api/v1/` suffix, SDK handles both cases.

5. **Backward compatibility**: SDK supports both legacy (`id`, `name`, `configEndpoint`) and new (`key`, `title`, `config`) formats.

## Backend Requirements

Backend must always return stage information in this exact schema format:

- All required fields must be present
- Field names must match exactly (case-sensitive)
- `_comment` is optional but recommended for documentation
- URL pattern must match Swagger specification
- `config` object must contain all required fields

## Client Requirements

Client/SDK must:

- Build URLs from config object components (not use hardcoded endpoints)
- Follow Swagger URL pattern: `/api/v1/{domain}/workflows/{workflow}/instances/{instanceKey}/functions/{function}`
- Handle baseUrl with or without `/api/v1/` suffix
- Ignore `_comment` field completely
- Support both legacy and new formats for backward compatibility
