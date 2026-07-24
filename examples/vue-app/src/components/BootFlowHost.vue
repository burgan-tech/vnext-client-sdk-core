<!--
  Boot-flow host — renders the UI-surfacing initialization flows (queued in
  `pendingBootFlows` by the init runner) through the SAME WorkflowView mechanism
  as any nav flow. Each flow is opened by instanceId; its own view surfaces as a
  teleported Dialog overlay (e.g. the ns-update-email dialog), so this host keeps
  a visually-hidden mount — no bespoke modal chrome (that would double-modal). The
  flow drives itself (auto-advance draft→go→collect→dialog); when it reaches a
  FINISH state the delegate's onWorkflowComplete dismisses it.

  This is the proof of "headless-vs-UI is emergent, uniform": a boot flow with a
  view renders like everything else; a headless one surfaces nothing and is never
  queued (it completed on its sync start).
-->
<script setup lang="ts">
import type { PseudoViewDelegate, ViewDefinition, WorkflowViewConfig } from '@burgan-tech/pseudo-ui';
import { PseudoView } from '@burgan-tech/pseudo-ui/vue';
import { makeDriveWorkflow } from '../boot/workflowDriver';
import { getTransitionForm } from '../boot/transitionForm';
import { pendingBootFlows, dismissBootFlow, type BootFlow } from '../boot/initialization';

// A boot flow → a view whose only node opens the started instance (detail/open
// mode); the WorkflowView drives it and surfaces its dialog.
function viewFor(f: BootFlow): ViewDefinition {
  return {
    view: {
      type: 'WorkflowView',
      domain: f.domain,
      name: f.name,
      ...(f.version ? { version: f.version } : {}),
      instanceId: f.instanceId,
    },
  } as unknown as ViewDefinition;
}

const delegate: PseudoViewDelegate = {
  driveWorkflow: makeDriveWorkflow({}),
  getTransitionForm,
  // The flow drove itself to a finish state → dismiss its mount (match by the
  // live instance id the WorkflowView is bound to).
  onWorkflowComplete: (config: WorkflowViewConfig) => {
    const f = pendingBootFlows.value.find((x) => x.instanceId === config.instanceId);
    if (f) dismissBootFlow(f.id);
  },
  onLog: (level, message) => console.debug(`%c[bootflow] ${level}: ${message}`, 'color:#0a8'),
};
</script>

<template>
  <!-- Visually hidden: the flow's own view surfaces as a teleported Dialog; this
       mount only exists to drive it. One mount per pending boot flow. -->
  <div class="d-bootflow-mounts" aria-hidden="true">
    <div v-for="f in pendingBootFlows" :key="f.id" class="d-bootflow-mount">
      <PseudoView
        :schema="{ type: 'object', properties: {} }"
        :view="viewFor(f)"
        :form-data="{}"
        :instance-data="{}"
        :lang="'tr'"
        :delegate="delegate"
      />
    </div>
  </div>
</template>

<style scoped>
/* Off-screen (not display:none — that could tear down the driving WorkflowView);
   the actual UI is the teleported Dialog overlay appended to the document. */
.d-bootflow-mounts {
  position: fixed;
  width: 0;
  height: 0;
  overflow: hidden;
  left: -9999px;
  top: -9999px;
}
</style>
