// ─────────────────────────────────────────────────────────────────────────
// workflow-manager SDK — the state-machine engine, wired to the REAL backend.
//
// Transport: MorphHttpDelegate over the morph-api client (host `morph-idm-api`,
// reached through the Vite dev proxy → test-vnext-morph-idm). The current
// state's view.content is a pseudo-ui ViewDefinition, rendered by <PseudoView>
// in WorkflowView.vue.
//
// The in-memory WorkflowMockBackend (src/mocks/workflow-backend.ts) is kept in
// the repo as an offline alternative but is not wired here.
// ─────────────────────────────────────────────────────────────────────────
import { WorkflowManager, MorphHttpDelegate } from 'amorphie-workflow-manager';
import { morph, SERVICE_AUTH_ID } from './morph';

// The `client` workflow lives in the `morph-idm` domain. For this sample we
// drive one fixed, existing instance (client business key).
export const WORKFLOW_DOMAIN = 'morph-idm';
export const WORKFLOW_NAME = 'client';
export const CLIENT_INSTANCE_KEY = 'IbWeb';

const httpDelegate = new MorphHttpDelegate(morph, 'morph-idm-api', SERVICE_AUTH_ID);

export const workflowManager = WorkflowManager.create({
  http: httpDelegate,
  workflows: [{ domain: WORKFLOW_DOMAIN, name: WORKFLOW_NAME, version: '1.0.0' }],
  defaultLongPollingConfig: {
    intervalSeconds: 3,
    durationSeconds: 30,
    timeoutSeconds: 10,
    useETag: true,
  },
  onLog: (level, message) => {
    // eslint-disable-next-line no-console
    console.debug(`%c[workflow] ${level}: ${message}`, 'color:#0a0');
  },
});
