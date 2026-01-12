/**
 * useStageSelection Composable
 * Handles stage selection dialog for multi-stage mode
 */

import { ref, createApp, h } from 'vue';
import StageSelectionDialog from '../components/StageSelectionDialog.vue';

let dialogApp: any = null;
let dialogContainer: HTMLElement | null = null;

export function useStageSelection() {
  const showDialog = ref(false);
  const stages = ref<Array<{ id: string; name: string }>>([]);
  const resolvePromise = ref<((stageId: string) => void) | null>(null);
  const rejectPromise = ref<((error: Error) => void) | null>(null);

  const showStageSelectionDialog = (
    availableStages: Array<{ id: string; name: string }>
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      stages.value = availableStages;
      resolvePromise.value = resolve;
      rejectPromise.value = reject;
      showDialog.value = true;

      // Create dialog app if not exists
      if (!dialogApp) {
        dialogContainer = document.createElement('div');
        dialogContainer.id = 'stage-selection-dialog-container';
        document.body.appendChild(dialogContainer);

        dialogApp = createApp({
          setup() {
            const handleConfirm = (stageId: string) => {
              if (resolvePromise.value) {
                resolvePromise.value(stageId);
                cleanup();
              }
            };

            const handleCancel = () => {
              if (rejectPromise.value) {
                rejectPromise.value(new Error('Stage selection cancelled by user'));
                cleanup();
              }
            };

            const cleanup = () => {
              showDialog.value = false;
              if (dialogApp && dialogContainer) {
                dialogApp.unmount();
                if (dialogContainer.parentNode) {
                  document.body.removeChild(dialogContainer);
                }
                dialogApp = null;
                dialogContainer = null;
              }
            };

            return () => h(StageSelectionDialog, {
              stages: stages.value,
              show: showDialog.value,
              onConfirm: handleConfirm,
              onCancel: handleCancel,
            });
          },
        });

        dialogApp.mount(dialogContainer);
      }
    });
  };

  return {
    showStageSelectionDialog,
  };
}
