const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

class EssenceItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "item"],
    position: { width: 480, height: 600 },
    form: { submitOnChange: true }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.item.system;
    return context;
  }
}

export class EssenceCardSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/card-sheet.hbs" }
  };
}

export class EssenceConditionSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/condition-sheet.hbs" }
  };
}

export class EssenceEquipmentSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/equipment-sheet.hbs" }
  };
}
