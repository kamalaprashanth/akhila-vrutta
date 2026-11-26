import type { Module } from "./types.ts";
import { settings } from "./settings.ts";
import { money } from "./money/index.ts";
import { household } from "./household/index.ts";
import { habits } from "./habits/index.ts";
import { today } from "./today/index.ts";
import { search } from "./search/index.ts";

import { health } from "./health/index.ts";
export { health };

import { documents as docs } from "./documents/index.ts";
export { docs };

export { today };
/** In the side menu's order. */
export const MODULES: Module[] = [today, money, household, health, habits, docs, settings, search];
