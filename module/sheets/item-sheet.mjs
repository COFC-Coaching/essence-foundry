const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ARRAY_ROW_DEFAULTS = {
  adaptations: { name: "", text: "", chosen: false },
  body: { label: "", html: "" },
  surges: { n: "1", html: "" },
  sections: { label: "", html: "" }
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

  /**
   * Mirrors EssenceActorSheet#applyEditable — lock the sheet down for anyone without edit
   * permission. Scoped to .window-content only: this.element is the whole ApplicationV2 window,
   * and its .window-header carries Foundry's own chrome (Close, Copy UUID, etc.), which also use
   * data-action — querying the full element previously locked those out too, so a read-only
   * (e.g. compendium) sheet couldn't even be closed.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.isEditable) return;
    const body = this.element.querySelector(".window-content") ?? this.element;
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
    // toggleCardView only flips local read/edit display state — it doesn't write to the
    // document, so a locked compendium (or any non-editable) card must still be viewable.
    for (const el of body.querySelectorAll('button[data-action]:not([data-action="toggleCardView"]), a[data-action]')) {
      el.classList.add("locked");
      el.style.pointerEvents = "none";
    }
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

/**
 * Cards are opened to be read far more often than they're edited — a player or GM checking a
 * card's text mid-turn shouldn't land on a form of bare inputs. Defaults to a read-only "card"
 * view (stat chips, labeled body lines, amber Surge badges reusing the chat roll-card's own
 * styling, a bordered Rider callout) with a toggle into the existing edit form. #viewMode is an
 * instance field, not persisted document data — Foundry caches one sheet instance per document,
 * so toggling to edit mode sticks for the rest of the session but resets for a fresh client.
 */
export class EssenceCardSheet extends EssenceItemSheetBase {
  static DEFAULT_OPTIONS = {
    actions: {
      toggleCardView: EssenceCardSheet.#onToggleView
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/item/card-sheet.hbs" }
  };

  #viewMode = true;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.viewMode = this.#viewMode;
    return context;
  }

  /**
   * Core's own DocumentSheetV2#_onRender disables every form-associated element (including
   * plain <button>s, via `form.elements`) whenever `!isEditable` — e.g. a locked system
   * compendium, which every card lives in by default. That's the right call for anything that
   * writes to the document, but toggleCardView only flips local display state, so a GM must
   * still be able to view a card they can't edit.
   */
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    const toggle = this.element.querySelector('[data-action="toggleCardView"]');
    if (toggle) toggle.disabled = false;
  }

  static #onToggleView() {
    this.#viewMode = !this.#viewMode;
    this.render();
  }
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
