/**
 * Shell modu — uygulama gövdesinin SDI (tek belge) veya MDI (çoklu tab)
 * paradigmasında çalışıp çalışmadığını belirler.
 */
export enum ShellMode {
  sdi = 'sdi',
  mdi = 'mdi',
}

/**
 * Route'un MDI yaşam döngüsü politikası.
 *
 * - `singleton`: Aynı identity (routeKey + opsiyonel `singletonKey` payload
 *   alanları) için tek tab; tekrar çağrıda mevcut tab aktive edilir.
 * - `transient`: Her çağrıda yeni UUID `tabKey` ile yeni tab açılır.
 */
export enum RouteLifetime {
  singleton = 'singleton',
  transient = 'transient',
}

/**
 * Route'a tekrar gelindiğinde davranış.
 *
 * - `refresh` (varsayılan): Surface dispose + recreate; `onNavigate` yeniden
 *   tetiklenir. Bankacılık gibi rakamların tazeliği kritik akışlarda tipik.
 * - `preserve`: Surface ve content layer state'i korunur; `onNavigate`
 *   tetiklenmez. Form/workflow ortasında tab değişiminde state kaybetmemek
 *   için kullanılır.
 */
export type RestoreMode = 'preserve' | 'refresh';

/**
 * Bir route'un sunum modu.
 *
 * - `surface` (varsayılan): Ana view (MDI tab veya SDI root).
 * - `overlay`: Modal / sheet / popover gibi underlay üzerine açılan ek katman.
 *   Görsel tip (modal, bottomSheet, toast, …) host'un `config.overlay.*`
 *   alanlarından okunur; SDK görsel tipi yorumlamaz.
 */
export type PresentationMode = 'surface' | 'overlay';

/**
 * Route `allowedShellModes` ihlali politikası.
 *
 * - `cancel`: Navigasyon iptal edilir + `shell-mode-not-allowed` log.
 * - `autoSwitch`: SDK önce `setShellMode(allowedShellModes[0])` yapar, sonra
 *   navigasyonu sürdürür.
 */
export type ShellModeConflictPolicy = 'cancel' | 'autoSwitch';

/**
 * `navigate()` çağrısının kaynağı. `'history'` ve `'shellSwitch'` SDK-internal'dir
 * (host tarafından request'e konursa SDK override eder + warn loglar).
 */
export type NavigateSource =
  | 'routeKey'
  | 'routeDefinition'
  | 'deepLink'
  | 'history'
  | 'shellSwitch';

/** Log seviyeleri — `OnLog` delegate'inin ilk argümanı. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
