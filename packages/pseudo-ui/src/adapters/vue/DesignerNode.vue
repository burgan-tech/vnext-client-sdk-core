<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ComponentNode } from '../../engine/types'
import { useDelegate, useDesigner } from './injection'

const props = defineProps<{
  path: string
  node: ComponentNode
}>()

const delegate = useDelegate()
const designer = useDesigner()

type DropPosition = 'before' | 'after' | 'inside'

const DRAG_PATH_KEY = 'application/x-pseudo-ui-path'
const DRAG_PALETTE_KEY = 'application/x-pseudo-ui-palette'

// Only the 'edit' mode renders interactive canvas chrome. 'preview' (and
// 'off') keep DesignerNode a transparent passthrough — the renderer's
// visibility-bypass behaviour stays active in preview, but no wrapper
// element, path attribute or handlers are emitted.
const isEdit = computed(() => designer?.mode === 'edit')
const selected = computed(() => !!designer && designer.selectedNodePath === props.path)
const dropPos = ref<DropPosition | null>(null)

function computeDropPosition(e: DragEvent): DropPosition {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const offsetY = e.clientY - rect.top
  const height = rect.height || 1
  const ratio = offsetY / height
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

function parentSegments(pointer: string): { parent: string; lastKey: string | number } | null {
  if (!pointer.startsWith('/')) return null
  const idx = pointer.lastIndexOf('/')
  if (idx <= 0) return { parent: '', lastKey: pointer.slice(1) }
  const last = pointer.slice(idx + 1)
  const lastKey: string | number = /^\d+$/.test(last) ? Number(last) : last.replace(/~1/g, '/').replace(/~0/g, '~')
  return { parent: pointer.slice(0, idx), lastKey }
}

/**
 * Translate (hoverPath, dropPosition) into (parentPath, key, index).
 * `before`/`after` insert as a sibling of the hovered node; `inside`
 * appends to the hovered node's own `children` collection.
 */
function computeDropTarget(hoverPath: string, pos: DropPosition): { parentPath: string; key: string; index: number } | null {
  if (pos === 'inside') {
    return { parentPath: hoverPath, key: 'children', index: Number.MAX_SAFE_INTEGER }
  }
  const segs = parentSegments(hoverPath)
  if (!segs) return null
  const arrayInfo = parentSegments(segs.parent)
  if (!arrayInfo || typeof segs.lastKey !== 'number') return null
  return {
    parentPath: arrayInfo.parent,
    key: String(arrayInfo.lastKey),
    index: pos === 'before' ? segs.lastKey : segs.lastKey + 1,
  }
}

function onClick(e: MouseEvent) {
  e.stopPropagation()
  delegate.onNodeSelect?.(props.path, props.node)
}

function onMouseEnter(e: MouseEvent) {
  e.stopPropagation()
  delegate.onNodeHover?.(props.path, props.node)
}

function onMouseLeave() {
  delegate.onNodeHover?.(null, null)
}

function onDragStart(e: DragEvent) {
  e.stopPropagation()
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(DRAG_PATH_KEY, props.path)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  const pos = computeDropPosition(e)
  dropPos.value = pos
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_PALETTE_KEY) ? 'copy' : 'move'
  }
}

function onDragLeave() {
  dropPos.value = null
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  const pos = dropPos.value ?? computeDropPosition(e)
  dropPos.value = null
  if (!e.dataTransfer) return

  const palette = e.dataTransfer.getData(DRAG_PALETTE_KEY)
  const dragPath = e.dataTransfer.getData(DRAG_PATH_KEY)

  if (palette) {
    const target = computeDropTarget(props.path, pos)
    if (target) delegate.onNodeDropFromPalette?.(target.parentPath, target.key, target.index, palette)
    return
  }
  if (dragPath && dragPath !== props.path) {
    const target = computeDropTarget(props.path, pos)
    if (target) delegate.onNodeMove?.(dragPath, target.parentPath, target.key, target.index)
  }
}

function onDelete(e: MouseEvent) {
  e.stopPropagation()
  delegate.onNodeDelete?.(props.path)
}

const cls = computed(() => {
  const cn = designer?.classNames
  const dropClassFor = (p: DropPosition): string | undefined => {
    switch (p) {
      case 'before': return cn?.dropBefore ?? 'pseudo-designer-node--drop-before'
      case 'after': return cn?.dropAfter ?? 'pseudo-designer-node--drop-after'
      case 'inside': return cn?.dropInside ?? 'pseudo-designer-node--drop-inside'
    }
  }
  return [
    cn?.node ?? 'pseudo-designer-node',
    selected.value ? (cn?.selected ?? 'pseudo-designer-node--selected') : '',
    dropPos.value ? dropClassFor(dropPos.value) : '',
  ].filter(Boolean).join(' ')
})

const deleteBtnClass = computed(() => designer?.classNames?.deleteButton ?? 'pseudo-designer-delete-btn')
</script>

<template>
  <div
    v-if="isEdit"
    :data-pseudo-path="path"
    :class="cls"
    draggable="true"
    @click="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <slot />
    <button
      v-if="selected"
      type="button"
      :class="deleteBtnClass"
      aria-label="Delete component"
      @click="onDelete"
    >×</button>
  </div>
  <slot v-else />
</template>
