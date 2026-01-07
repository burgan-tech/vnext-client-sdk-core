/**
 * View Manager
 */

import type {
  ViewDefinition,
  ViewComponent,
  ViewState,
  ViewManager as IViewManager,
} from '../types/view';
import type { ApiClient } from '../api';
import type { StateStore } from '../state';
import { EventEmitter } from '../state/event-emitter';

export class ViewManager implements IViewManager {
  private views: Map<string, ViewDefinition> = new Map();
  private viewStates: Map<string, ViewState> = new Map();
  private eventEmitter: EventEmitter;

  constructor(
    private apiClient: ApiClient,
    private stateStore: StateStore
  ) {
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Load view definition from backend
   */
  async load(viewId: string): Promise<ViewDefinition> {
    try {
      const response = await this.apiClient.get<ViewDefinition>(`/views/${viewId}`);
      const definition = response.data;
      this.views.set(viewId, definition);
      this.stateStore.set(`views.${viewId}`, definition);
      return definition;
    } catch (error) {
      console.error(`Failed to load view ${viewId}:`, error);
      throw error;
    }
  }

  /**
   * Render view definition
   */
  async render(definition: ViewDefinition, container?: HTMLElement | string): Promise<void> {
    const targetContainer = typeof container === 'string'
      ? document.querySelector(container) as HTMLElement
      : container || document.body;

    if (!targetContainer) {
      throw new Error('Container not found');
    }

    // Initialize view state if not exists
    if (!this.viewStates.has(definition.id)) {
      this.viewStates.set(definition.id, {
        viewId: definition.id,
        data: {},
        errors: {},
        touched: {},
        dirty: false,
      });
    }

    // Render view components
    this.renderComponent(definition.layout, targetContainer, definition.id);
  }

  /**
   * Update view data
   */
  updateData(path: string, value: any): void {
    const [viewId, ...dataPath] = path.split('.');
    const state = this.viewStates.get(viewId);
    
    if (!state) return;

    // Update nested data
    let current: any = state.data;
    for (let i = 0; i < dataPath.length - 1; i++) {
      if (!current[dataPath[i]]) {
        current[dataPath[i]] = {};
      }
      current = current[dataPath[i]];
    }
    current[dataPath[dataPath.length - 1]] = value;

    state.dirty = true;
    this.viewStates.set(viewId, state);
    this.stateStore.set(`views.${viewId}.state`, state);

    this.eventEmitter.emit('dataChange', { viewId, data: state.data });
  }

  /**
   * Get view data
   */
  getData(): Record<string, any> {
    // Get data from current view state or return empty
    const states = Array.from(this.viewStates.values());
    if (states.length === 0) return {};

    // Merge all view data
    const data: Record<string, any> = {};
    states.forEach(state => {
      data[state.viewId] = state.data;
    });

    return data;
  }

  /**
   * Validate view
   */
  validate(): boolean {
    // Validation logic would be implemented based on view definition
    // For now, return true
    return true;
  }

  /**
   * Get validation errors
   */
  getErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    this.viewStates.forEach((state, viewId) => {
      Object.entries(state.errors).forEach(([key, value]) => {
        errors[`${viewId}.${key}`] = value;
      });
    });
    return errors;
  }

  /**
   * Reset view
   */
  reset(): void {
    this.viewStates.forEach((state, viewId) => {
      state.data = {};
      state.errors = {};
      state.touched = {};
      state.dirty = false;
      this.viewStates.set(viewId, state);
      this.stateStore.set(`views.${viewId}.state`, state);
    });
  }

  /**
   * Subscribe to data changes
   */
  onDataChange(callback: (data: Record<string, any>) => void): () => void {
    return this.eventEmitter.on('dataChange', callback);
  }

  /**
   * Subscribe to validation changes
   */
  onValidationChange(callback: (errors: Record<string, string>) => void): () => void {
    return this.eventEmitter.on('validationChange', callback);
  }

  /**
   * Render component recursively
   */
  private renderComponent(
    component: ViewComponent,
    container: HTMLElement,
    viewId: string
  ): void {
    const element = this.createElement(component, viewId);
    
    if (component.children) {
      component.children.forEach(child => {
        this.renderComponent(child, element, viewId);
      });
    }

    container.appendChild(element);
  }

  /**
   * Create DOM element from component
   */
  private createElement(component: ViewComponent, viewId: string): HTMLElement {
    const element = document.createElement(this.getTagName(component.type));
    element.id = component.id;
    
    // Apply props
    if (component.props) {
      Object.entries(component.props).forEach(([key, value]) => {
        if (key === 'className' || key === 'class') {
          element.className = String(value);
        } else if (key.startsWith('data-')) {
          element.setAttribute(key, String(value));
        } else {
          (element as any)[key] = value;
        }
      });
    }

    // Apply styles
    if (component.style) {
      Object.entries(component.style).forEach(([key, value]) => {
        (element.style as any)[key] = value;
      });
    }

    // Bind events
    if (component.events) {
      Object.entries(component.events).forEach(([event, handler]) => {
        if (typeof handler === 'function') {
          element.addEventListener(event, handler);
        } else if (typeof handler === 'string') {
          // Handle string-based event handlers (would need to be resolved)
          console.warn('String-based event handlers not yet implemented');
        }
      });
    }

    return element;
  }

  /**
   * Get HTML tag name from component type
   */
  private getTagName(type: string): string {
    const tagMap: Record<string, string> = {
      text: 'span',
      input: 'input',
      textarea: 'textarea',
      select: 'select',
      checkbox: 'input',
      radio: 'input',
      button: 'button',
      form: 'form',
      container: 'div',
      grid: 'div',
      list: 'ul',
      table: 'table',
      card: 'div',
      modal: 'div',
      tabs: 'div',
    };

    return tagMap[type] || 'div';
  }
}

