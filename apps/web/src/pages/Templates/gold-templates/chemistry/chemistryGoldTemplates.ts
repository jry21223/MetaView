import type { GoldTemplateManifest } from "../manifest";
import { GALVANIC_CELL_GOLD_TEMPLATE } from "./galvanicCellGoldTemplate";
import { TITRATION_GOLD_TEMPLATE } from "./titrationGoldTemplate";
import { HABER_GOLD_TEMPLATE } from "./haberGoldTemplate";
import { ESTERIFICATION_GOLD_TEMPLATE } from "./esterificationGoldTemplate";
import { COLLISION_GOLD_TEMPLATE } from "./collisionGoldTemplate";

/**
 * 高中化学课程包：五个公开 Gold 案例，按课本顺序排列（必修第二册 →
 * 选择性必修1）。取代原先的 redox-electron 模板与中和占位。
 */
export const CHEMISTRY_PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  // 必修第二册
  GALVANIC_CELL_GOLD_TEMPLATE,
  ESTERIFICATION_GOLD_TEMPLATE,
  // 选择性必修1
  COLLISION_GOLD_TEMPLATE,
  HABER_GOLD_TEMPLATE,
  TITRATION_GOLD_TEMPLATE,
]);
