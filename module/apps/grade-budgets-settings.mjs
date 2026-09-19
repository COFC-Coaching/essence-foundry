import { GRADE_BUDGETS } from "../data/monster-budgets.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const GRADES = ["Mook", "Normal", "Elite"];
const FIELDS = [
  "attributePool", "attributeMax", "skillPool", "skillMax",
  "resilienceBase", "resiliencePerTier", "temporaryWoundsAvailable",
  "actionCards", "reactionCards", "equipmentCount", "woundCapacity"
];

/**
 * GM-facing settings menu for the homebrew Grade (Mook/Normal/Elite) budget table the Monster
 * Creator auto-fills stat blocks from (see monster-budgets.mjs's own doc comment: "there's nothing
 * canonical to match, so tune this table freely if actual play calls for it"). Previously that
 * meant editing source; this exposes the same numbers through Foundry's own Settings menu instead,
 * matching how any other GM-tunable value in a system should be configurable.
 */
export default class EssenceGradeBudgetsSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "essence-grade-budgets-settings",
    classes: ["essence", "grade-budgets-settings"],
    tag: "form",
    window: { title: "ESSENCE.Settings.GradeBudgets.Title", icon: "fa-solid fa-scale-balanced" },
    position: { width: 640, height: "auto" },
    form: { handler: EssenceGradeBudgetsSettings.#onSubmit, submitOnChange: false, closeOnSubmit: true },
    actions: {
      resetDefaults: EssenceGradeBudgetsSettings.#onResetDefaults
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/settings/grade-budgets.hbs" }
  };

  async _prepareContext() {
    const stored = game.settings.get("essence-system", "gradeBudgets");
    return {
      gradeNames: GRADES,
      fields: FIELDS.map((field) => ({
        field,
        labelKey: `ESSENCE.Settings.GradeBudgets.Field.${field}`,
        cells: GRADES.map((grade) => ({ grade, value: stored[grade]?.[field] ?? GRADE_BUDGETS[grade][field] }))
      }))
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const next = {};
    for (const grade of GRADES) {
      next[grade] = {};
      for (const field of FIELDS) {
        next[grade][field] = Number(data[grade]?.[field]) || 0;
      }
    }
    await game.settings.set("essence-system", "gradeBudgets", next);
  }

  static async #onResetDefaults() {
    await game.settings.set("essence-system", "gradeBudgets", GRADE_BUDGETS);
    this.render();
  }
}
