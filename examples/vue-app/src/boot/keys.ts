import type { InjectionKey } from 'vue';
import type { IPageRouter } from 'page-router';
import type { NavItem, TokenLevel } from '@burgan-tech/app-host';

/** key → NavItem, provided at boot so any view surface can resolve its item. */
export const ITEMS_BY_KEY: InjectionKey<Map<string, NavItem>> = Symbol('itemsByKey');

/** The active page-router, provided so views can trigger navigation. */
export const APP_ROUTER: InjectionKey<IPageRouter> = Symbol('appRouter');

/** Switch auth level (re-boots the app for the new token level). */
export const APP_SET_TOKEN_LEVEL: InjectionKey<(level: TokenLevel) => void> = Symbol('appSetTokenLevel');

/**
 * Generic UI-chrome strings (section headings, empty-state, tooltips) the
 * pseudo-ui SDK renders itself — sourced from backend `client-config.i18n.strings`
 * so the SDK ships no translated literals. Provided at boot, fed to <PseudoView>.
 */
export const APP_UI_STRINGS: InjectionKey<Record<string, unknown>> = Symbol('appUiStrings');

/**
 * Default data domain for instance-listing views (from `client-config.dataDomain`).
 * Lets list views omit a solution-specific `domain` literal. Provided at boot,
 * fed to <PseudoView :data-domain>.
 */
export const APP_DATA_DOMAIN: InjectionKey<string> = Symbol('appDataDomain');

/**
 * Config-referenced surface views (from `client-config.views`) — e.g.
 * `{ transitionHistory: { key, domain, flow } }`. The SDK opens these as a modal
 * or page per the referenced view's own `display`. Provided at boot, fed to
 * <PseudoView :config-views>.
 */
export const APP_CONFIG_VIEWS: InjectionKey<Record<string, unknown>> = Symbol('appConfigViews');
