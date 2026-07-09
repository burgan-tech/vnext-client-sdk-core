// ─────────────────────────────────────────────────────────────────────────
// workflow-manager SDK — in-process mock backend (HttpDelegate).
//
// Adapted from the upstream sample's mock-backend: it keeps a tiny in-memory
// state machine (`login → otp → done`) and speaks the exact wire format the
// SDK's parsers expect. The ONE change vs. upstream: each state's `view.content`
// is a real pseudo-ui `ViewDefinition`, so the current workflow step renders
// directly through <PseudoView>. A pseudo-ui `submit` action (command = the
// transition key) is bridged back to `wf.transition(...)` in WorkflowView.vue.
// ─────────────────────────────────────────────────────────────────────────
import type { HttpDelegate, HttpRequest, HttpResponse } from 'amorphie-workflow-manager';

interface ScenarioState {
  state: string;
  status: 'A' | 'B' | 'C' | 'D';
  view: {
    pageId: string;
    content: Record<string, unknown>; // pseudo-ui ViewDefinition
    type: 'Json';
    display: 'full-page' | 'inline';
  } | null;
  data: Record<string, unknown>;
  transitions: Array<{
    transition: string;
    nextState: string;
    type: 'manual';
    requireData: boolean;
  }>;
}

/** Build a pseudo-ui ViewDefinition (what <PseudoView> renders). */
function viewDef(view: Record<string, unknown>): Record<string, unknown> {
  return {
    $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
    dataSchema: 'inline',
    view,
  };
}

const SCENARIO: Record<string, ScenarioState> = {
  login: {
    state: 'login',
    status: 'A',
    view: {
      pageId: 'login-page',
      content: viewDef({
        type: 'Column',
        gap: 'md',
        children: [
          { type: 'Text', content: '🔐 Sign in', variant: 'headlineMedium' },
          { type: 'Text', content: 'Workflow state: login', variant: 'bodyMedium' },
          { type: 'TextField', bind: 'username', label: 'Username' },
          { type: 'TextField', bind: 'password', label: 'Password' },
          {
            type: 'Button',
            label: 'Continue',
            // command == the workflow transition key; WorkflowView bridges it.
            action: { action: 'submit', command: 'submit-login' },
          },
        ],
      }),
      type: 'Json',
      display: 'full-page',
    },
    data: { attempts: 0 },
    transitions: [
      { transition: 'submit-login', nextState: 'otp', type: 'manual', requireData: true },
    ],
  },
  otp: {
    state: 'otp',
    status: 'A',
    view: {
      pageId: 'otp-page',
      content: viewDef({
        type: 'Column',
        gap: 'md',
        children: [
          { type: 'Text', content: '📱 Verify OTP', variant: 'headlineMedium' },
          { type: 'Text', content: 'Enter the 6-digit code we sent you.', variant: 'bodyMedium' },
          { type: 'TextField', bind: 'code', label: 'OTP code' },
          {
            type: 'Button',
            label: 'Verify',
            action: { action: 'submit', command: 'verify-otp' },
          },
        ],
      }),
      type: 'Json',
      display: 'full-page',
    },
    data: { otpResendCount: 0 },
    transitions: [
      { transition: 'verify-otp', nextState: 'done', type: 'manual', requireData: true },
      { transition: 'cancel', nextState: 'login', type: 'manual', requireData: false },
    ],
  },
  done: {
    state: 'done',
    status: 'C',
    view: {
      pageId: 'done-page',
      content: viewDef({
        type: 'Column',
        gap: 'md',
        children: [
          { type: 'Text', content: '✅ Verified!', variant: 'headlineMedium' },
          { type: 'Text', content: 'The workflow reached a terminal state.', variant: 'bodyMedium' },
        ],
      }),
      type: 'Json',
      display: 'full-page',
    },
    data: { result: 'verified' },
    transitions: [],
  },
};

export interface MockBackendOptions {
  latencyMs?: number;
  onRequest?: (req: HttpRequest) => void;
}

interface InstanceRecord {
  instanceId: string;
  domain: string;
  workflowName: string;
  state: string;
  revision: number;
  attributes: Record<string, unknown>;
}

export class WorkflowMockBackend implements HttpDelegate {
  private readonly instances = new Map<string, InstanceRecord>();
  private nextInstanceSeq = 1;

  constructor(private readonly options: MockBackendOptions = {}) {}

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    this.options.onRequest?.(req);
    if (this.options.latencyMs && this.options.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.options.latencyMs));
    }

    const route = match(req);
    if (!route) return notFound<T>(req.path);

    switch (route.kind) {
      case 'start':
        return this.handleStart<T>();
      case 'state':
        return this.handleState<T>(route.instanceId, req.headers?.['if-none-match']);
      case 'data':
        return this.handleData<T>(route.instanceId);
      case 'view':
        return this.handleView<T>(route.instanceId);
      case 'transition':
        return this.handleTransition<T>(route.instanceId, route.transitionKey, req.body);
      case 'getInstance':
        return this.handleGetInstance<T>(route.instanceId);
      default:
        return notFound<T>(req.path);
    }
  }

  reset(): void {
    this.instances.clear();
    this.nextInstanceSeq = 1;
  }

  private handleStart<T>(): HttpResponse<T> {
    const instanceId = `inst-${this.nextInstanceSeq++}`;
    this.instances.set(instanceId, {
      instanceId,
      domain: 'onboarding',
      workflowName: 'kyc-flow',
      state: 'login',
      revision: 1,
      attributes: {},
    });
    return ok<T>(201, etag(instanceId, 1), {
      id: instanceId,
      status: 'A',
      eTag: etag(instanceId, 1),
    });
  }

  private handleState<T>(instanceId: string, ifNoneMatch?: string): HttpResponse<T> {
    const inst = this.instances.get(instanceId);
    if (!inst) return notFound<T>(`instance ${instanceId}`);

    const currentEtag = etag(instanceId, inst.revision);
    if (ifNoneMatch && ifNoneMatch === currentEtag) return notModified<T>(currentEtag);

    const scenario = SCENARIO[inst.state]!;
    const base = `/onboarding/workflows/kyc-flow/instances/${instanceId}/functions`;
    return ok<T>(200, currentEtag, {
      state: scenario.state,
      status: scenario.status,
      data: { href: `${base}/data` },
      view: {
        hasView: scenario.view !== null,
        href: scenario.view !== null ? `${base}/view` : '',
        loadData: true,
      },
      transitions: scenario.transitions.map((t) => ({
        name: t.transition,
        view: { hasView: false, loadData: false },
        schema: { hasSchema: t.requireData },
      })),
      activeCorrelations: [],
      eTag: currentEtag,
    });
  }

  private handleData<T>(instanceId: string): HttpResponse<T> {
    const inst = this.instances.get(instanceId);
    if (!inst) return notFound<T>(`instance ${instanceId}`);
    const scenario = SCENARIO[inst.state]!;
    const tag = etag(instanceId, inst.revision, 'data');
    return ok<T>(200, tag, {
      data: { ...scenario.data, ...inst.attributes },
      extensions: {},
      eTag: tag,
    });
  }

  private handleView<T>(instanceId: string): HttpResponse<T> {
    const inst = this.instances.get(instanceId);
    if (!inst) return notFound<T>(`instance ${instanceId}`);
    const scenario = SCENARIO[inst.state]!;
    if (!scenario.view) return notFound<T>(`view for ${inst.state}`);
    const tag = etag(instanceId, inst.revision, 'view');
    return ok<T>(200, tag, {
      key: scenario.view.pageId,
      content: scenario.view.content,
      type: scenario.view.type,
      display: scenario.view.display,
      label: '',
    });
  }

  private handleTransition<T>(
    instanceId: string,
    transitionKey: string,
    body: unknown,
  ): HttpResponse<T> {
    const inst = this.instances.get(instanceId);
    if (!inst) return notFound<T>(`instance ${instanceId}`);

    const scenario = SCENARIO[inst.state]!;
    const tx = scenario.transitions.find((t) => t.transition === transitionKey);
    if (!tx) {
      return error<T>(409, `Transition "${transitionKey}" not allowed in state "${inst.state}"`);
    }

    if (body && typeof body === 'object') {
      const wrapper = body as { attributes?: Record<string, unknown> };
      if (wrapper.attributes && typeof wrapper.attributes === 'object') {
        Object.assign(inst.attributes, wrapper.attributes);
      }
    }

    inst.state = tx.nextState;
    inst.revision += 1;

    return ok<T>(200, etag(instanceId, inst.revision), {
      id: instanceId,
      status: SCENARIO[inst.state]!.status,
      eTag: etag(instanceId, inst.revision),
    });
  }

  private handleGetInstance<T>(instanceId: string): HttpResponse<T> {
    const inst = this.instances.get(instanceId);
    if (!inst) return notFound<T>(`instance ${instanceId}`);
    return ok<T>(200, etag(instanceId, inst.revision), {
      id: instanceId,
      status: SCENARIO[inst.state]!.status,
      eTag: etag(instanceId, inst.revision),
    });
  }
}

type Route =
  | { kind: 'start' }
  | { kind: 'state'; instanceId: string }
  | { kind: 'data'; instanceId: string }
  | { kind: 'view'; instanceId: string }
  | { kind: 'transition'; instanceId: string; transitionKey: string }
  | { kind: 'getInstance'; instanceId: string };

const PATTERNS: Array<{ method: string; regex: RegExp; build: (m: RegExpMatchArray) => Route }> = [
  { method: 'POST', regex: /^\/[^/]+\/workflows\/[^/]+\/instances\/start$/, build: () => ({ kind: 'start' }) },
  { method: 'GET', regex: /^\/[^/]+\/workflows\/[^/]+\/instances\/([^/]+)\/functions\/state$/, build: (m) => ({ kind: 'state', instanceId: decodeURIComponent(m[1]!) }) },
  { method: 'GET', regex: /^\/[^/]+\/workflows\/[^/]+\/instances\/([^/]+)\/functions\/data$/, build: (m) => ({ kind: 'data', instanceId: decodeURIComponent(m[1]!) }) },
  { method: 'GET', regex: /^\/[^/]+\/workflows\/[^/]+\/instances\/([^/]+)\/functions\/view$/, build: (m) => ({ kind: 'view', instanceId: decodeURIComponent(m[1]!) }) },
  { method: 'PATCH', regex: /^\/[^/]+\/workflows\/[^/]+\/instances\/([^/]+)\/transitions\/([^/]+)$/, build: (m) => ({ kind: 'transition', instanceId: decodeURIComponent(m[1]!), transitionKey: decodeURIComponent(m[2]!) }) },
  { method: 'GET', regex: /^\/[^/]+\/workflows\/[^/]+\/instances\/([^/]+)$/, build: (m) => ({ kind: 'getInstance', instanceId: decodeURIComponent(m[1]!) }) },
];

function match(req: HttpRequest): Route | null {
  const path = req.path.split('?')[0]!;
  for (const p of PATTERNS) {
    if (p.method !== req.method) continue;
    const m = path.match(p.regex);
    if (m) return p.build(m);
  }
  return null;
}

function etag(instanceId: string, revision: number, suffix?: string): string {
  return `"${instanceId}:${revision}${suffix ? `:${suffix}` : ''}"`;
}

function ok<T>(status: number, etagValue: string, data: unknown): HttpResponse<T> {
  return { ok: true, status, headers: { etag: etagValue, 'content-type': 'application/json' }, data: data as T };
}

function notModified<T>(etagValue: string): HttpResponse<T> {
  return { ok: true, status: 304, headers: { etag: etagValue }, data: null };
}

function notFound<T>(detail: string): HttpResponse<T> {
  return { ok: false, status: 404, headers: { 'content-type': 'application/problem+json' }, data: { type: 'about:blank', title: 'Not Found', status: 404, detail } as T };
}

function error<T>(status: number, detail: string): HttpResponse<T> {
  return { ok: false, status, headers: { 'content-type': 'application/problem+json' }, data: { type: 'about:blank', title: 'Error', status, detail } as T };
}
