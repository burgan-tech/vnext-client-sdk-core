<!--
  Timer node — a countdown display (e.g. OTP validity / resend window). Renders a
  server-defined `{ type:"Timer", duration, format, variant }` node: counts down
  from `duration` seconds, formats per `format` (mm:ss default), and emits a
  `timer:expire` intent via the delegate when it reaches zero (the host maps it,
  e.g. to enable a resend button). Generic — no solution-specific logic.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDelegate } from './injection'

const props = defineProps<{ node: Record<string, unknown> }>()
const delegate = useDelegate()

const duration = computed(() => {
  const d = Number(props.node.duration)
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : 0
})
const format = computed(() => String(props.node.format ?? 'mm:ss'))
const variant = computed(() => String(props.node.variant ?? 'chip'))

const remaining = ref(duration.value)
let handle: ReturnType<typeof setInterval> | null = null
let expired = false

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const display = computed(() => {
  const s = Math.max(0, remaining.value)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  switch (format.value) {
    case 'hh:mm:ss':
      return `${pad(h)}:${pad(m)}:${pad(sec)}`
    case 'ss':
      return String(s)
    case 'mm:ss':
    default:
      return `${pad(Math.floor(s / 60))}:${pad(sec)}`
  }
})

function stop(): void {
  if (handle) {
    clearInterval(handle)
    handle = null
  }
}

async function onExpire(): Promise<void> {
  if (expired) return
  expired = true
  await delegate.onAction?.('timer:expire', {}, props.node.command as string | undefined)
}

onMounted(() => {
  if (duration.value <= 0) {
    void onExpire()
    return
  }
  // End-time based so a throttled/slept tab still shows the correct remaining.
  const end = Date.now() + duration.value * 1000
  handle = setInterval(() => {
    remaining.value = Math.max(0, Math.ceil((end - Date.now()) / 1000))
    if (remaining.value <= 0) {
      stop()
      void onExpire()
    }
  }, 250)
})

onBeforeUnmount(stop)
</script>

<template>
  <span
    v-if="variant === 'chip'"
    class="d-timer d-timer-chip"
    :class="{ 'd-timer-expired': remaining <= 0 }"
    role="timer"
    aria-live="polite"
  >
    <i class="pi pi-clock d-timer-icon"></i>{{ display }}
  </span>
  <span v-else class="d-timer" :class="{ 'd-timer-expired': remaining <= 0 }" role="timer" aria-live="polite">
    {{ display }}
  </span>
</template>
