/**
 * Unit tests for `WorkflowManager.getInstance()`.
 *
 * Mirrors the integration-style happy path test but isolates the read so we
 * cover: success, 304, error, and dispose-after.
 */

import { describe, expect, it } from 'vitest';
import { WorkflowManager } from '../../src/index.js';
import { MockHttpDelegate } from '../helpers/mock-http-delegate.js';
import { FakeTimer } from '../helpers/fake-timer.js';

const ENVELOPE = {
  id: 'inst-1',
  key: 'IbWeb',
  flow: 'client',
  domain: 'morph-idm',
  flowVersion: '1.0.0',
  eTag: '"snap-1"',
  entityEtag: '"ent-1"',
  tags: ['banking', 'test'],
  metadata: {
    currentState: 'active',
    effectiveState: 'active',
    status: 'A',
    effectiveStateType: 'intermediate',
    effectiveStateSubType: 'none',
    createdAt: '2026-02-20T08:21:08.258838Z',
    modifiedAt: '2026-02-20T08:21:08.989638Z',
  },
  attributes: { clientName: 'Amorph Portal', secret: 'super-secret' },
  extensions: { audit: { createdBy: 'admin-001' } },
};

describe('WorkflowManager.getInstance', () => {
  it('returns a parsed envelope on 200 with full metadata + attributes + extensions', async () => {
    const http = new MockHttpDelegate();
    const timer = new FakeTimer();
    http.enqueue(
      {
        ok: true,
        status: 200,
        headers: { etag: '"snap-1"' },
        data: ENVELOPE,
      },
      {
        match: (r) =>
          r.method === 'GET' &&
          r.path === '/morph-idm/workflows/client/instances/IbWeb',
      },
    );

    const wm = WorkflowManager.create({ http, timer });
    const result = await wm.getInstance({
      domain: 'morph-idm',
      name: 'client',
      instanceId: 'IbWeb',
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.notModified).toBeUndefined();
    expect(result.instance).not.toBeNull();
    expect(result.instance?.id).toBe('inst-1');
    expect(result.instance?.key).toBe('IbWeb');
    expect(result.instance?.flow).toBe('client');
    expect(result.instance?.flowVersion).toBe('1.0.0');
    expect(result.instance?.tags).toEqual(['banking', 'test']);
    expect(result.instance?.metadata.currentState).toBe('active');
    expect(result.instance?.metadata.status).toBe('A');
    expect(result.instance?.metadata.effectiveStateType).toBe('intermediate');
    expect(result.instance?.attributes).toEqual({
      clientName: 'Amorph Portal',
      secret: 'super-secret',
    });
    expect(result.instance?.extensions).toEqual({
      audit: { createdBy: 'admin-001' },
    });
    expect(result.instance?.eTag).toBe('"snap-1"');
    wm.dispose();
  });

  it('returns notModified=true when backend returns 304', async () => {
    const http = new MockHttpDelegate();
    const timer = new FakeTimer();
    http.enqueue({ ok: true, status: 304, headers: { etag: '"snap-1"' }, data: null });

    const wm = WorkflowManager.create({ http, timer });
    const result = await wm.getInstance({
      domain: 'morph-idm',
      name: 'client',
      instanceId: 'IbWeb',
      ifNoneMatch: '"snap-1"',
    });

    // Confirm the SDK actually forwarded the conditional header to the
    // delegate (header casing is the WorkflowApiService's responsibility).
    const sentHeaders = http.calls[0]?.headers ?? {};
    const sentIfNoneMatch = Object.entries(sentHeaders).find(
      ([k]) => k.toLowerCase() === 'if-none-match',
    )?.[1];
    expect(sentIfNoneMatch).toBe('"snap-1"');

    expect(result.ok).toBe(true);
    expect(result.notModified).toBe(true);
    expect(result.instance).toBeNull();
    expect(result.statusCode).toBe(304);
    wm.dispose();
  });

  it('returns an error envelope when backend rejects (404)', async () => {
    const http = new MockHttpDelegate();
    const timer = new FakeTimer();
    http.enqueue({
      ok: false,
      status: 404,
      headers: { 'content-type': 'application/problem+json' },
      data: { type: 'about:blank', title: 'Not Found', status: 404, detail: 'no such instance' },
    });

    const wm = WorkflowManager.create({ http, timer });
    const result = await wm.getInstance({
      domain: 'morph-idm',
      name: 'client',
      instanceId: 'unknown',
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.instance).toBeNull();
    expect(result.error?.message).toBe('no such instance');
    wm.dispose();
  });

  it('returns disposed error after dispose()', async () => {
    const wm = WorkflowManager.create({
      http: new MockHttpDelegate(),
      timer: new FakeTimer(),
    });
    wm.dispose();
    const result = await wm.getInstance({
      domain: 'morph-idm',
      name: 'client',
      instanceId: 'IbWeb',
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('disposed');
  });
});
