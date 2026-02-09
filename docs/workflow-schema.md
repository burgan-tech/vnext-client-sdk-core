# Workflow Schema Documentation

## Overview

Backend always returns workflow information in a standardized schema. This schema is used for all workflow-related operations, including stage selection workflows.

## Workflow Schema

When a workflow is provided (e.g., for stage selection), backend returns the following structure:

```json
{
  "selector-workflow": {
    "_comment": "http://localhost:3001/api/v1/discovery/workflows/stage-selector/instances/start",
    "runtime": "v2",
    "baseUrl": "http://localhost:3001",
    "domain": "discovery",
    "workflow": "stage-selector",
    "version": "1.1"
  }
}
```

## Field Descriptions

### `runtime` (required)
- **Type**: `string`
- **Description**: Runtime version identifier (e.g., "v2")
- **Example**: `"v2"`

### `baseUrl` (required)
- **Type**: `string`
- **Description**: Base URL for the workflow API
- **Example**: `"http://localhost:3001"` or `"https://api.example.com"`

### `domain` (required)
- **Type**: `string`
- **Description**: Domain identifier for the workflow
- **Example**: `"discovery"`, `"morph-idm"`

### `workflow` (required)
- **Type**: `string`
- **Description**: Workflow name/identifier
- **Example**: `"stage-selector"`, `"user-onboarding"`

### `version` (required)
- **Type**: `string`
- **Description**: Workflow version
- **Example**: `"1.1"`, `"2.0"`

### `_comment` (optional, ignored by SDK)
- **Type**: `string`
- **Description**: Reference comment showing the built URL (for documentation purposes only)
- **Note**: This field is **completely ignored** by SDK and applications. It exists only for human reference.
- **Example**: `"http://localhost:3001/api/v1/discovery/workflows/stage-selector/instances/start"`

## URL Construction

The client builds the workflow start URL according to the Swagger API pattern:

```
{baseUrl}/api/v1/{domain}/workflows/{workflow}/instances/start?version={version}
```

### Example

Given:
```json
{
  "baseUrl": "http://localhost:3001",
  "domain": "discovery",
  "workflow": "stage-selector",
  "version": "1.1"
}
```

Built URL:
```
http://localhost:3001/api/v1/discovery/workflows/stage-selector/instances/start?version=1.1
```

## Swagger Compliance

This schema follows the backend Swagger API specification:

- **Endpoint Pattern**: `/api/v1/{domain}/workflows/{workflow}/instances/start`
- **Method**: `POST`
- **Version Parameter**: Query parameter `?version={version}`
- **Request Body**: Contains workflow attributes (e.g., `availableStages` for stage selection)

## Usage in SDK

### Stage Selection Workflow

When `multiStageMode` is `"onStartup"` and a workflow is provided in `environments.json`:

1. SDK extracts workflow information from `environments.selector-workflow` (or `environments.workflow`)
2. SDK builds the URL using the pattern above
3. SDK starts the workflow instance via POST request
4. Workflow instance is passed to `onStageSelection` callback
5. Callback renders workflow UI and returns selected stage ID

### Example Implementation

```typescript
// SDK automatically builds URL from workflow schema
const workflowEndpoint = `${workflow.baseUrl}/api/v1/${workflow.domain}/workflows/${workflow.workflow}/instances/start?version=${workflow.version}`;

// Start workflow instance
const response = await fetch(workflowEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    attributes: {
      availableStages: stages,
    },
  }),
});
```

## Important Notes

1. **`_comment` is ignored**: The `_comment` field is for documentation/reference only. SDK and applications completely ignore it.

2. **URL is built by client**: The client constructs the URL from the schema components, following Swagger patterns. No hardcoded endpoints.

3. **Swagger compliance**: The schema structure ensures compatibility with backend Swagger API specifications.

4. **Flexible structure**: By providing components instead of a full URL, the structure is more flexible and maintainable.

## Backend Requirements

Backend must always return workflow information in this exact schema format:

- All required fields must be present
- Field names must match exactly (case-sensitive)
- `_comment` is optional but recommended for documentation
- URL pattern must match Swagger specification

## Client Requirements

Client/SDK must:

- Build URLs from schema components (not use hardcoded endpoints)
- Follow Swagger URL pattern: `/api/v1/{domain}/workflows/{workflow}/instances/start`
- Pass `version` as query parameter
- Ignore `_comment` field completely
- Handle missing workflow gracefully (fallback to default behavior)



"widget" {
  "type" :"neo-textbox"
  "args":{
    "dataBind" : "applicant.firstName",
    "binding" : "twoWay",
    "default": "Guest"
  }
}
