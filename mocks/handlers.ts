import { http, HttpResponse } from 'msw';
import environments from '../docs/sample-service-responses/environments.json';
import clientFunctionConfig from '../docs/sample-service-responses/client-function-config.json';
import navigationDevice from '../docs/sample-service-responses/navigation-device.json';
import navigation1fa from '../docs/sample-service-responses/navigation-1fa.json';
import navigation2fa from '../docs/sample-service-responses/navigation-2fa.json';

// Mock token storage (in-memory for development)
let mockTokens: {
  device?: string;
  '1fa'?: string;
  '2fa'?: string;
} = {};

// Mock user state
let mockUser: {
  authenticated: boolean;
  tokenType?: 'device' | '1fa' | '2fa';
  userId?: string;
  username?: string;
} = {
  authenticated: false,
};

// Mock instance storage
const mockInstances = new Map<string, {
  id: string;
  key?: string;
  flow: string;
  domain: string;
  flowVersion: string;
  etag: string;
  tags?: string[];
  attributes?: any;
  extensions?: Record<string, any>;
  status: {
    code: string;
    description: string;
  };
}>();

// ETag storage for function responses
const functionETags = new Map<string, string>();

// Helper to generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper to generate ETag
function generateETag(): string {
  return `"${Date.now()}-${Math.random().toString(36).substring(2, 9)}"`;
}

// Helper to check ETag (304 Not Modified)
function checkETag(request: Request, currentETag: string): HttpResponse | null {
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === currentETag) {
    return new HttpResponse(null, { status: 304 });
  }
  return null;
}

export const handlers = [
  // ===== ENVIRONMENTS (Tenant: discovery) =====
  // GET /api/v1/discovery/workflows/enviroment/instances/{appKey}/functions/enviroment
  http.get('/api/v1/discovery/workflows/enviroment/instances/:appKey/functions/enviroment', ({ params, request }) => {
    const { appKey } = params;
    const functionKey = `discovery:enviroment:${appKey}:enviroment`;
    
    // Get or create ETag for this function
    let etag = functionETags.get(functionKey);
    if (!etag) {
      etag = generateETag();
      functionETags.set(functionKey, etag);
    }
    
    // Check ETag
    const etagCheck = checkETag(request, etag);
    if (etagCheck) {
      return etagCheck;
    }
    
    // Return environments list filtered by appKey
    // In real implementation, this would filter environment records by appKey
    return HttpResponse.json(
      environments,
      {
        headers: {
          'ETag': etag,
        },
      }
    );
  }),

  // ===== CLIENT CONFIG (Tenant: morph-idm) =====
  // GET /api/v1/morph-idm/workflows/client/instances/{appKey}/functions/client
  http.get('/api/v1/morph-idm/workflows/client/instances/:appKey/functions/client', ({ params, request }) => {
    const { appKey } = params;
    const functionKey = `morph-idm:client:${appKey}:client`;
    
    // Get or create ETag for this function
    let etag = functionETags.get(functionKey);
    if (!etag) {
      etag = generateETag();
      functionETags.set(functionKey, etag);
    }
    
    // Check ETag
    const etagCheck = checkETag(request, etag);
    if (etagCheck) {
      return etagCheck;
    }
    
    // Return client config for the appKey
    // In real implementation, this would filter client config by appKey
    return HttpResponse.json(
      clientFunctionConfig,
      {
        headers: {
          'ETag': etag,
        },
      }
    );
  }),

  // ===== LEGACY ENDPOINTS (for backward compatibility) =====
  http.get('/environments.json', () => {
    return HttpResponse.json(environments);
  }),

  http.get('/client/config', () => {
    return HttpResponse.json(clientFunctionConfig);
  }),

  // ===== NAVIGATION =====
  http.get('/client/navigation', ({ request }) => {
    const url = new URL(request.url);
    const tokenType = url.searchParams.get('tokenType') || mockUser.tokenType || 'device';

    let navigation;
    switch (tokenType) {
      case '2fa':
        navigation = navigation2fa;
        break;
      case '1fa':
        navigation = navigation1fa;
        break;
      case 'device':
      default:
        navigation = navigationDevice;
        break;
    }

    return HttpResponse.json(navigation);
  }),

  // ===== AUTH - DEVICE REGISTER =====
  http.post('/auth/device/register', async ({ request }) => {
    const body = await request.json() as { deviceId: string; installationId: string };
    
    // Mock device token
    const deviceToken = `device_token_${Date.now()}`;
    mockTokens.device = deviceToken;
    mockUser = {
      authenticated: true,
      tokenType: 'device',
    };

    return HttpResponse.json({
      token: deviceToken,
      tokenType: 'device',
      expiresIn: 31536000, // 1 year
    });
  }),

  // ===== AUTH - DEVICE AUTH =====
  http.post('/auth/device', async ({ request }) => {
    const body = await request.json() as { deviceId: string; installationId: string };
    
    // Return existing device token or create new one
    if (!mockTokens.device) {
      mockTokens.device = `device_token_${Date.now()}`;
    }

    mockUser = {
      authenticated: true,
      tokenType: 'device',
    };

    return HttpResponse.json({
      token: mockTokens.device,
      tokenType: 'device',
      expiresIn: 31536000,
    });
  }),

  // ===== AUTH - LOGIN (2FA) =====
  http.post('/auth/login', async ({ request }) => {
    const body = await request.json() as { username: string; password: string };
    
    // Mock login - always succeeds
    const token1fa = `1fa_token_${Date.now()}`;
    const token2fa = `2fa_token_${Date.now()}`;
    
    mockTokens['1fa'] = token1fa;
    mockTokens['2fa'] = token2fa;
    
    mockUser = {
      authenticated: true,
      tokenType: '2fa',
      userId: 'user_123',
      username: body.username,
    };

    return HttpResponse.json({
      tokens: {
        '1fa': {
          token: token1fa,
          expiresIn: 7776000, // 90 days
        },
        '2fa': {
          token: token2fa,
          expiresIn: 300, // 5 minutes
        },
      },
      user: {
        id: 'user_123',
        username: body.username,
        email: `${body.username}@example.com`,
      },
    });
  }),

  // ===== AUTH - TOKEN REFRESH =====
  http.post('/auth/refresh', async ({ request }) => {
    const body = await request.json() as { refreshToken: string };
    
    // Only 2FA token can be refreshed
    if (mockTokens['2fa']) {
      const newToken2fa = `2fa_token_${Date.now()}`;
      mockTokens['2fa'] = newToken2fa;
      
      return HttpResponse.json({
        token: newToken2fa,
        tokenType: '2fa',
        expiresIn: 300,
      });
    }

    return HttpResponse.json(
      { error: 'Invalid refresh token' },
      { status: 401 }
    );
  }),

  // ===== AUTH - TOKEN VALIDATE =====
  http.get('/auth/validate', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader) {
      return HttpResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Check if token exists
    if (
      token === mockTokens.device ||
      token === mockTokens['1fa'] ||
      token === mockTokens['2fa']
    ) {
      return HttpResponse.json({
        valid: true,
        tokenType: mockUser.tokenType,
        user: mockUser.userId ? {
          id: mockUser.userId,
          username: mockUser.username,
        } : null,
      });
    }

    return HttpResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }),

  // ===== DEFINITIONS =====
  http.post('/api/v1/definitions/publish', async ({ request }) => {
    const body = await request.json() as {
      key: string;
      flow: string;
      domain: string;
      version: string;
      tags?: string[];
      attributes: any;
      data?: Array<{
        key: string;
        version: string;
        tags?: string[];
        attributes: any;
      }>;
    };
    
    // Mock publish - just return OK
    return HttpResponse.json(null, { status: 200 });
  }),

  // ===== FUNCTIONS =====
  http.patch('/api/v1/:domain/functions', ({ params }) => {
    const { domain } = params;
    return HttpResponse.json(null, { status: 200 });
  }),

  http.get('/api/v1/:domain/functions/:function', ({ params, request }) => {
    const { domain, function: functionName } = params;
    const url = new URL(request.url);
    
    // Mock function response
    return HttpResponse.json({
      key: functionName,
      domain,
      data: {},
    });
  }),

  http.get('/api/v1/:domain/workflows/:workflow/functions/:function', ({ params, request }) => {
    const { domain, workflow, function: functionName } = params;
    const url = new URL(request.url);
    
    // Mock function response
    return HttpResponse.json({
      key: functionName,
      domain,
      workflow,
      data: {},
    });
  }),

  http.get('/api/v1/:domain/workflows/:workflow/instances/:instance/functions/:function', ({ params, request }) => {
    const { domain, workflow, instance, function: functionName } = params;
    
    // Get instance
    const instanceData = mockInstances.get(instance as string);
    if (!instanceData) {
      return HttpResponse.json(
        {
          type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
          title: 'Not Found',
          status: 404,
          detail: `Instance ${instance} not found`,
        },
        { status: 404 }
      );
    }

    // Check ETag
    const etagCheck = checkETag(request, instanceData.etag);
    if (etagCheck) {
      return etagCheck;
    }

    // Mock function response with ETag
    return HttpResponse.json(
      {
        key: functionName,
        domain,
        workflow,
        instance,
        data: instanceData.attributes || {},
      },
      {
        headers: {
          'ETag': instanceData.etag,
        },
      }
    );
  }),

  // ===== WORKFLOW INSTANCES =====
  http.post('/api/v1/:domain/workflows/:workflow/instances/start', async ({ params, request }) => {
    const { domain, workflow } = params;
    const url = new URL(request.url);
    const version = url.searchParams.get('version');
    const sync = url.searchParams.get('sync') === 'true';
    
    const body = await request.json() as {
      key?: string;
      tags?: string[];
      attributes?: any;
    };
    
    // Create new instance
    const instanceId = generateUUID();
    const etag = generateETag();
    
    const instance = {
      id: instanceId,
      key: body.key,
      flow: workflow as string,
      domain: domain as string,
      flowVersion: version || '1.0',
      etag,
      tags: body.tags,
      attributes: body.attributes || {},
      extensions: {},
      status: {
        code: 'active',
        description: 'Instance is active',
      },
    };
    
    mockInstances.set(instanceId, instance);
    
    return HttpResponse.json({
      id: instanceId,
      status: {
        code: 'active',
        description: 'Instance is active',
      },
    });
  }),

  http.get('/api/v1/:domain/workflows/:workflow/instances/:instance', ({ params, request }) => {
    const { domain, workflow, instance } = params;
    const url = new URL(request.url);
    const extensions = url.searchParams.getAll('extension');
    
    const instanceData = mockInstances.get(instance as string);
    
    if (!instanceData) {
      return HttpResponse.json(
        {
          type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
          title: 'Not Found',
          status: 404,
          detail: `Instance ${instance} not found`,
        },
        { status: 404 }
      );
    }

    // Check ETag
    const etagCheck = checkETag(request, instanceData.etag);
    if (etagCheck) {
      return etagCheck;
    }

    // Return instance with ETag
    return HttpResponse.json(
      {
        id: instanceData.id,
        key: instanceData.key,
        flow: instanceData.flow,
        domain: instanceData.domain,
        flowVersion: instanceData.flowVersion,
        etag: instanceData.etag,
        tags: instanceData.tags,
        attributes: instanceData.attributes,
        extensions: instanceData.extensions,
      },
      {
        headers: {
          'ETag': instanceData.etag,
        },
      }
    );
  }),

  http.get('/api/v1/:domain/workflows/:workflow/instances', ({ params, request }) => {
    const { domain, workflow } = params;
    const url = new URL(request.url);
    const filter = url.searchParams.getAll('filter');
    const extensions = url.searchParams.getAll('extension');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const sort = url.searchParams.get('sort');
    
    // Filter instances by domain and workflow
    const filteredInstances = Array.from(mockInstances.values()).filter(
      (inst) => inst.domain === domain && inst.flow === workflow
    );
    
    // Apply pagination
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedInstances = filteredInstances.slice(start, end);
    
    return HttpResponse.json({
      items: paginatedInstances.map((inst) => ({
        id: inst.id,
        key: inst.key,
        flow: inst.flow,
        domain: inst.domain,
        flowVersion: inst.flowVersion,
        etag: inst.etag,
        tags: inst.tags,
        attributes: inst.attributes,
        extensions: inst.extensions,
      })),
      total: filteredInstances.length,
      page,
      pageSize,
    });
  }),

  // ===== TRANSITIONS =====
  http.get('/api/v1/:domain/workflows/:workflow/instances/:instance/transitions', ({ params, request }) => {
    const { domain, workflow, instance } = params;
    const url = new URL(request.url);
    const extensions = url.searchParams.getAll('extension');
    
    const instanceData = mockInstances.get(instance as string);
    
    if (!instanceData) {
      return HttpResponse.json(
        {
          type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
          title: 'Not Found',
          status: 404,
          detail: `Instance ${instance} not found`,
        },
        { status: 404 }
      );
    }

    // Mock transitions
    return HttpResponse.json([
      {
        key: 'next',
        label: 'Next Step',
        enabled: true,
      },
      {
        key: 'cancel',
        label: 'Cancel',
        enabled: true,
      },
    ]);
  }),

  http.patch('/api/v1/:domain/workflows/:workflow/instances/:instance/transitions/:transitionKey', async ({ params, request }) => {
    const { domain, workflow, instance, transitionKey } = params;
    const url = new URL(request.url);
    const version = url.searchParams.get('version');
    const sync = url.searchParams.get('sync') === 'true';
    
    const body = await request.json() as {
      key?: string;
      tags?: string[];
      attributes?: any;
    };
    
    const instanceData = mockInstances.get(instance as string);
    
    if (!instanceData) {
      return HttpResponse.json(
        {
          type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
          title: 'Not Found',
          status: 404,
          detail: `Instance ${instance} not found`,
        },
        { status: 404 }
      );
    }

    // Update instance
    instanceData.etag = generateETag();
    if (body.attributes) {
      instanceData.attributes = { ...instanceData.attributes, ...body.attributes };
    }
    if (body.tags) {
      instanceData.tags = body.tags;
    }
    if (body.key) {
      instanceData.key = body.key;
    }

    // Update status based on transition
    if (transitionKey === 'complete') {
      instanceData.status = {
        code: 'completed',
        description: 'Instance completed',
      };
    } else if (transitionKey === 'cancel') {
      instanceData.status = {
        code: 'cancelled',
        description: 'Instance cancelled',
      };
    }

    mockInstances.set(instance as string, instanceData);

    return HttpResponse.json({
      id: instanceData.id,
      status: instanceData.status,
    });
  }),

  // ===== LEGACY VIEW ENDPOINTS (for backward compatibility) =====
  http.get('/view/:viewKey', ({ params }) => {
    const { viewKey } = params;
    
    return HttpResponse.json({
      key: viewKey,
      version: '1.0',
      components: [
        {
          type: 'text',
          content: `Mock view content for ${viewKey}`,
        },
      ],
    });
  }),

  // ===== LEGACY SEARCH VIEW ENDPOINTS =====
  http.post('/search/:searchKey', async ({ params, request }) => {
    const { searchKey } = params;
    const body = await request.json() as { query?: string; filters?: Record<string, any>; page?: number; pageSize?: number };
    
    return HttpResponse.json({
      results: [],
      total: 0,
      page: body.page || 1,
      pageSize: body.pageSize || 20,
    });
  }),

  // ===== LEGACY STATE VIEW ENDPOINTS =====
  http.get('/state-view/:workflowId/:instanceId/:state', ({ params }) => {
    const { workflowId, instanceId, state } = params;
    
    return HttpResponse.json({
      history: true,
      features: ['document', 'notes'],
      summary: {
        labels: [{ label: 'Mock State View', language: 'tr' }],
        view: {
          key: `${workflowId}-summary`,
          version: '1.0',
          domain: 'mock',
          flow: 'view',
          flowVersion: '1.0',
        },
        timeoutInfo: true,
        transitions: {
          flow: true,
          shared: true,
          feature: true,
        },
        groups: [],
      },
    });
  }),

  // ===== GENERIC API CATCH-ALL =====
  http.all('/api/*', ({ request }) => {
    return HttpResponse.json(
      {
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
        title: 'Not Found',
        status: 404,
        detail: `Mock endpoint not implemented: ${request.url}`,
      },
      { status: 404 }
    );
  }),
];
