import { describe, expect, it } from 'vitest';
import { WorkflowManager } from '../../src/index.js';
import { MockHttpDelegate } from '../helpers/mock-http-delegate.js';
import { FakeTimer } from '../helpers/fake-timer.js';

describe('WorkflowManager — happy path', () => {
  it('starts a workflow, polls state, dispatches view, and stops on completion', async () => {
    const http = new MockHttpDelegate();
    const timer = new FakeTimer();

    // ---- 1. POST start instance → returns instanceId
    http.enqueue(
      {
        ok: true,
        status: 201,
        headers: { etag: '"start-1"' },
        data: { id: 'inst-1', status: 'A', eTag: '"start-1"' },
      },
      { match: (r) => r.method === 'POST' && r.path.endsWith('/instances/start') },
    );

    // ---- 2. GET state (first polling tick) → busy
    http.enqueue(
      {
        ok: true,
        status: 200,
        headers: { etag: '"state-1"' },
        data: {
          state: 'verify-otp',
          stateType: 'wizard',
          status: 'B',
          data: { href: '/api/onboarding/.../functions/data' },
          view: { hasView: true, href: '/api/onboarding/.../functions/view', loadData: true },
          transitions: [],
          activeCorrelations: [],
          eTag: '"state-1"',
        },
      },
      { match: (r) => r.method === 'GET' && r.path.endsWith('/functions/state') },
    );

    // ---- 3. GET data (after state with new currentState)
    http.enqueue(
      {
        ok: true,
        status: 200,
        headers: { etag: '"data-1"' },
        data: { data: { otpRetries: 0 }, extensions: {}, eTag: '"data-1"' },
      },
      { match: (r) => r.method === 'GET' && r.path.endsWith('/functions/data') },
    );

    // ---- 4. GET view (after state)
    http.enqueue(
      {
        ok: true,
        status: 200,
        headers: { etag: '"view-1"' },
        data: {
          key: 'verify-otp-page',
          content: { type: 'form', fields: [] },
          type: 'Json',
          display: 'full-page',
          label: '',
        },
      },
      { match: (r) => r.method === 'GET' && r.path.endsWith('/functions/view') },
    );

    // ---- 5. polling tick → completed
    http.enqueue(
      {
        ok: true,
        status: 200,
        headers: { etag: '"state-2"' },
        data: {
          state: 'done',
          stateType: 'finish',
          status: 'C',
          data: { href: '/api/onboarding/.../functions/data' },
          view: { hasView: false, href: '', loadData: false },
          transitions: [],
          activeCorrelations: [],
          eTag: '"state-2"',
        },
      },
      { match: (r) => r.method === 'GET' && r.path.endsWith('/functions/state') },
    );

    // ---- 6. data refresh after state change
    http.enqueue(
      {
        ok: true,
        status: 200,
        headers: { etag: '"data-2"' },
        data: { data: { result: 'ok' }, extensions: {}, eTag: '"data-2"' },
      },
      { match: (r) => r.method === 'GET' && r.path.endsWith('/functions/data') },
    );

    const events: string[] = [];

    const wm = WorkflowManager.create({
      http,
      timer,
      workflows: [{ domain: 'onboarding', name: 'kyc-flow', version: '1.0.0' }],
      defaultLongPollingConfig: {
        intervalSeconds: 1,
        durationSeconds: 60,
        timeoutSeconds: 5,
        useETag: true,
      },
    });

    wm.on('navigationRequested', (e) => events.push(`nav:${e.navigationPath}`));
    wm.on('stateChanged', (e) => events.push(`state:${e.state}/${e.status}`));
    wm.on('pollingStopped', (e) => events.push(`stop:${e.reason}`));

    const startResult = await wm.startWorkflow({
      domain: 'onboarding',
      name: 'kyc-flow',
      attributes: { channel: 'web' },
    });

    expect(startResult.ok).toBe(true);
    expect(startResult.instanceId).toBe('inst-1');

    // post-start: state is NOT cached yet — polling is the sole state processor.
    expect(wm.getStateByWorkflowName('kyc-flow')).toBeNull();

    // advance the polling timer to fire the first tick (verify-otp/busy)
    await timer.tick(1100);
    // give the async chain a couple of microtask flushes
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const cached = wm.getStateByWorkflowName('kyc-flow');
    expect(cached?.currentState).toBe('verify-otp');
    expect(cached?.status).toBe('busy');
    expect(cached?.stateType).toBe('wizard');
    expect(wm.getViewContent('inst-1')).toEqual({ type: 'form', fields: [] });
    expect(wm.getData('inst-1')).toEqual({ otpRetries: 0 });
    expect(events).toContain('state:verify-otp/busy');
    expect(events).toContain('nav:verify-otp-page');

    // advance the polling timer to fire the second tick (done/completed)
    await timer.tick(1100);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(events).toContain('state:done/completed');
    expect(events).toContain('stop:completed');

    expect(wm.getStateByWorkflowName('kyc-flow')?.status).toBe('completed');
    // Response-provided stateType overrides the previously cached one.
    expect(wm.getStateByWorkflowName('kyc-flow')?.stateType).toBe('finish');
    expect(wm.getData('inst-1')).toEqual({ result: 'ok' });

    wm.dispose();
    expect(wm.isDisposed).toBe(true);
  });

  it('returns disposed error envelope after dispose()', async () => {
    const http = new MockHttpDelegate();
    const timer = new FakeTimer();
    const wm = WorkflowManager.create({ http, timer });

    wm.dispose();
    const result = await wm.startWorkflow({ domain: 'd', name: 'n' });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('disposed');
  });
});
