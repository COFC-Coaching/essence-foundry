import { ROLE_BUDGETS } from "../data/monster-budgets.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const ROLES = ["Minion", "Standard", "Elite", "Nemesis"];
const FIELDS = [
  "attributePool", "attributeMax", "skillPool", "skillMax",
  "resilienceBase", "resiliencePerTier", "temporaryWoundsAvailable",
  "actionCards", "reactionCards", "equipmentCount"
];

/**
 * GM-facing settings menu for the homebrew Role (Minion/Standard/Elite/Nemesis) budget table the
 * Monster Creator auto-fills stat blocks from (see monster-budgets.mjs's own doc comment: "there's
 * nothing canonical to match, so tune this table freely if actual play calls for it"). Previously
 * that meant editing source; this exposes the same numbers through Foundry's own Settings menu
 * instead, matching how any other GM-tunable value in a system should be configurable.
 */
export default class EssenceRoleBudgetsSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "essence-role-budgets-settings",
    classes: ["essence", "role-budgets-settings"],
    tag: "form",
    window: { title: "ESSENCE.Settings.RoleBudgets.Title", icon: "fa-solid fa-scale-balanced" },
    position: { width: 640, height: "auto" },
    form: { handler: EssenceRoleBudgetsSettings.#onSubmit, submitOnChange: false, closeOnSubmit: true },
    actions: {
      resetDefaults: EssenceRoleBudgetsSettings.#onResetDefaults
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/settings/role-budgets.hbs" }
  };

  async _prepareContext() {
    const stored = game.settings.get("essence-system", "roleBudgets");
    return {
      roleNames: ROLES,
      fields: FIELDS.map((field) => ({
        field,
        labelKey: `ESSENCE.Settings.RoleBudgets.Field.${field}`,
        cells: ROLES.map((role) => ({ role, value: stored[role]?.[field] ?? ROLE_BUDGETS[role][field] }))
      }))
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const next = {};
    for (const role of ROLES) {
      next[role] = {};
      for (const field of FIELDS) {
        next[role][field] = Number(data[role]?.[field]) || 0;
      }
    }
    await game.settings.set("essence-system", "roleBudgets", next);
  }

  static async #onResetDefaults() {
    await game.settings.set("essence-system", "roleBudgets", ROLE_BUDGETS);
    this.render();
  }
}
