/**
 * Loader contracts and the default API implementations.
 *
 * Each loader returns a uniform `LoaderResult<T>` envelope:
 *  - `data: T`  — payload was fetched, fresh.
 *  - `data: null` + `notModified: true` — backend returned `304`; cache is valid.
 *  - `null` — recoverable failure (the caller logs and continues).
 *
 * Default implementations call the `instanceFunction` endpoint via the
 * shared `WorkflowApiService`.
 */

export type { DataLoader, LoaderResult, SchemaLoader, ViewLoader } from '../../types.js';

export { ApiDataLoader } from './api-data-loader.js';
export { ApiViewLoader } from './api-view-loader.js';
export { ApiSchemaLoader } from './api-schema-loader.js';
