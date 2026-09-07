const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ARRAY_ROW_DEFAULTS = {
  adaptations: { name: "", text: "", chosen: false }
};

class EssenceItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "item"],
    position: { width: 480, height: 600 },
    form: { submitOnChange: true },
    actions: {
      addArrayRow: EssenceItemSheetBase.#onAddArrayRow,
      deleteArrayRow: EssenceItemSheetBase.#onDeleteArrayRow
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    return context;
  }

  static async #onAddArrayRow(event, target) {
    const key = target.dataset.array;
    const rows = this.item.system[key].map((row) => foundry.utils.deepClone(row));
    rows.push(foundry.utils.deepClone(ARRAY_ROW_DEFAULTS[key]));
    await this.item.update({ [`system.${key}`]: rows });
  }

  static async #onDeleteArrayRow(event, target) {
    const key = target.dataset.array;
    const i = Number(target.dataset.index);
    const rows = this.item.system[key].map((row) => foundry.utils.deepClone(row));
    rows.splice(i, 1);
    await this.item.update({ [`system.${key}`]: rows });
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

export class EssenceSpeciesSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/species-sheet.hbs" }
  };
}

export class EssenceHeritageSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/heritage-sheet.hbs" }
  };
}

export class EssenceDistinctionSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/distinction-sheet.hbs" }
  };
}
