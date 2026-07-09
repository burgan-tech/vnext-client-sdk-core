import type { InjectionKey } from 'vue';
import type { IPageRouter } from 'page-router';
import type { NavItem } from '@burgan-tech/app-host';

/** key → NavItem, provided at boot so any view surface can resolve its item. */
export const ITEMS_BY_KEY: InjectionKey<Map<string, NavItem>> = Symbol('itemsByKey');

/** The active page-router, provided so views can trigger navigation. */
export const APP_ROUTER: InjectionKey<IPageRouter> = Symbol('appRouter');
