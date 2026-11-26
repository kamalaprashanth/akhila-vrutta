/**
 * The sheet, confirm and toast kit every area uses. It began in Money (ui/kit.ts, kept as the planner had it);
 * other areas import it from here, so they don't depend on Money's folder (review #14).
 */
export { askConfirm, closeModal, ensureLayer, field, openSheet, toast, val } from "../modules/money/ui/kit.ts";
