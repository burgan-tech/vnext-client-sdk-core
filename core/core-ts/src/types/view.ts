/**
 * View Manager Types
 */

export type ViewComponentType = 
  | 'text' 
  | 'input' 
  | 'textarea' 
  | 'select' 
  | 'checkbox' 
  | 'radio' 
  | 'button' 
  | 'form' 
  | 'container' 
  | 'grid' 
  | 'list' 
  | 'table' 
  | 'card' 
  | 'modal' 
  | 'tabs';

export interface ViewComponent {
  id: string;
  type: ViewComponentType;
  props?: Record<string, any>;
  children?: ViewComponent[];
  style?: Record<string, any>;
  events?: Record<string, string | ((...args: any[]) => void)>;
  validation?: ViewValidation;
  conditional?: ViewConditional;
}

export interface ViewDefinition {
  id: string;
  name: string;
  version?: string;
  layout: ViewComponent;
  metadata?: Record<string, any>;
}

export interface ViewValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  custom?: (value: any) => boolean | string;
}

export interface ViewConditional {
  field?: string;
  operator?: 'equals' | 'notEquals' | 'contains' | 'exists';
  value?: any;
  show?: boolean;
}

export interface ViewState {
  viewId: string;
  data: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  dirty: boolean;
}

export interface ViewManager {
  load(viewId: string): Promise<ViewDefinition>;
  render(definition: ViewDefinition, container?: HTMLElement | string): Promise<void>;
  updateData(path: string, value: any): void;
  getData(): Record<string, any>;
  validate(): boolean;
  getErrors(): Record<string, string>;
  reset(): void;
  onDataChange(callback: (data: Record<string, any>) => void): () => void;
  onValidationChange(callback: (errors: Record<string, string>) => void): () => void;
}

