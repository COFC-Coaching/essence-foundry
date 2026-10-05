import CardBrowser from "./card-browser.mjs";
import { EQUIPMENT_CATEGORY_LABELS } from "../data/item-card.mjs";
import { stripHtml } from "../utils.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const COMPONENT_KINDS = ["equipment", "chassis", "fitting", "augment"];

/**
 * The Essence Browser (Shane, 2026-10-04): a standalone window to search and filter the system's
 * compendium content the way the Character Wizard's Qualifying Cards step does, without having
 * to be inside a wizard. Two tabs:
 *
 * - Cards: every Action and Reaction Card in the packs, through the same CardBrowser (search,
 *   Type / Style / Subtype / Expertise / Sort) the two wizards share — nothing is re-implemented.
 *   A "For" select picks one of the user's characters: that character's Expertises drive the
 *   Expertise filter and the Mastery tag, cards it already owns are marked, and the Add button
 *   adds a card straight onto it. With no character chosen the list is a pure reference browser.
 * - Equipment: the equipment pack (complete items plus loose Chassis / Fittings / Augments) with
 *   search, Kind, Category and Tier filters.
 *
 * Every row is draggable onto any sheet using Foundry's standard {type: "Item", uuid} drag data,
 * and its name opens the compendium sheet. Packs are read once per window (getDocuments, same as
 * the wizards; a few hundred documents) and cached on the instance.
 *
 * Opened from the Essence scene-control group, the Compendium sidebar's header, and a character
 * sheet's header control (essence.mjs / actor-sheet.mjs).
 */
export default class EssenceCompendiumBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "essence-compendium-browser",
    classes: ["essence", "compendium-browser"],
    window: { title: "ESSENCE.Browser.Title", icon: "fa-solid fa-magnifying-glass", resizable: true },
    position: { width: 640, height: 760 },
    actions: {
      previewItem: EssenceCompendiumBrowser.#onPreviewItem,
      toggleCard: EssenceCompendiumBrowser.#onAddCard,
      addEquipment: EssenceCompendiumBrowser.#onAddEquipment
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/apps/compendium-browser.hbs", scrollable: [".browser-list"] }
  };

  static TABS = {
    primary: {
      initial: "cards",
      tabs: [
        { id: "cards", label: "ESSENCE.Browser.TabCards" },
        { id: "equipment", label: "ESSENCE.Browser.TabEquipment" }
      ]
    }
  };

  /** @param {Actor|null} actor - a character to browse "for" (optional) */
  constructor(actor = null, options = {}) {
    super(options);
    this.#actorId = actor?.id ?? game.user.character?.id ?? "";
  }

  #cards = new CardBrowser();
  #equip = { search: "", kind: "all", category: "all", tier: "all" };
  #actorId = "";
  #refocusEquip = false;
  #docs = null;

  /** The character the Cards tab is browsing for, if any. */
  get actor() {
    const actor = this.#actorId ? game.actors.get(this.#actorId) : null;
    return actor?.isOwner ? actor : null;
  }

  async #loadDocs() {
    if (this.#docs) return this.#docs;
    const [actions, reactions, equipment] = await Promise.all([
      game.packs.get("essence-system.action-cards")?.getDocuments() ?? [],
      game.packs.get("essence-system.reaction-cards")?.getDocuments() ?? [],
      game.packs.get("essence-system.equipment")?.getDocuments() ?? []
    ]);
    this.#docs = { actions, reactions, equipment };
    return this.#docs;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tabs = this._prepareTabs("primary");
    const docs = await this.#loadDocs();
    const actor = this.actor;

    // Characters this user may add to; the current pick first so the select never jumps.
    context.actorOptions = game.actors
      .filter((a) => a.type === "character" && a.isOwner)
      .map((a) => ({ id: a.id, name: a.name, selected: a.id === this.#actorId }))
      .sort((a, b) => a.name.localeCompare(b.name));
    context.actorId = actor?.id ?? "";
    context.hasActor = !!actor;

    // Cards: everything in both packs. Owned cards are flagged after prepare() so the row can show
    // a check instead of a plus (prepare() itself doesn't know about ownership).
    const qualifying = [
      ...docs.actions.map((doc) => ({ doc, type: "action-card" })),
      ...docs.reactions.map((doc) => ({ doc, type: "reaction-card" }))
    ];
    this.#cards.prepare(context, qualifying, actor?.system.expertises ?? []);
    // The partial's count line says "qualify" inside a wizard (where cards are gated); here nothing is.
    context.browserReference = true;
    const ownedNames = new Set(actor ? actor.items.filter((i) => i.type === "action-card" || i.type === "reaction-card").map((i) => i.name) : []);
    for (const card of context.browsableCards) card.owned = ownedNames.has(card.name);

    // Equipment: the pack's complete items plus loose components, each labelled by kind.
    const f = this.#equip;
    const search = f.search.trim().toLowerCase();
    let rows = docs.equipment
      .filter((d) => COMPONENT_KINDS.includes(d.type))
      .map((d) => ({
        id: d.id, uuid: d.uuid, name: d.name, kind: d.type,
        kindLabel: game.i18n.localize(`ESSENCE.Browser.Kind.${d.type}`),
        category: d.system.category ?? "",
        categoryLabel: d.system.category ? (EQUIPMENT_CATEGORY_LABELS[d.system.category] ?? d.system.category) : "",
        tier: d.system.tier ?? null,
        augmentKind: d.type === "augment" ? d.system.kind : "",
        summary: (() => { const t = stripHtml(d.system.effect || d.system.flavor || ""); return t.length > 110 ? `${t.slice(0, 109)}…` : t; })()
      }));
    if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search));
    if (f.kind !== "all") rows = rows.filter((r) => r.kind === f.kind);
    if (f.category !== "all") rows = rows.filter((r) => r.category === f.category);
    if (f.tier !== "all") rows = rows.filter((r) => String(r.tier ?? "") === f.tier);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    context.equipmentRows = rows;
    context.equipFilter = { ...f };
    context.equipKindOptions = COMPONENT_KINDS.map((k) => ({ value: k, label: game.i18n.localize(`ESSENCE.Browser.Kind.${k}`) }));
    context.equipCategoryOptions = Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
    context.equipTierOptions = [1, 2, 3, 4, 5];
    context.equipCount = rows.length;
    return context;
  }

  /** Core only wires drag-and-drop on its own Actor/Item sheets (ActorSheetV2#_dragDrop); a plain
   *  ApplicationV2 binds its own. Rebound on every render since the rows are re-created. */
  #dragDrop = null;

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    this.#dragDrop ??= new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".browser-draggable",
      callbacks: { dragstart: this._onDragStart.bind(this) }
    });
    this.#dragDrop.bind(root);
    this.#cards.wire(root, () => this.render());

    const search = root.querySelector('[data-browser-search="equipment"]');
    if (search) {
      search.addEventListener("input", (e) => { this.#equip.search = e.currentTarget.value; this.#refocusEquip = true; this.render(); });
      if (this.#refocusEquip) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); this.#refocusEquip = false; }
    }
    for (const key of ["kind", "category", "tier"]) {
      root.querySelector(`[data-browser-select="${key}"]`)?.addEventListener("change", (e) => { this.#equip[key] = e.currentTarget.value; this.render(); });
    }
    root.querySelector('[data-browser-select="actor"]')?.addEventListener("change", (e) => { this.#actorId = e.currentTarget.value; this.render(); });
  }

  /** Standard Foundry drag data so any actor sheet (or the Items directory) accepts the drop. */
  _onDragStart(event) {
    const uuid = event.currentTarget.dataset.uuid;
    if (!uuid) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid }));
  }

  static async #onPreviewItem(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet.render(true);
  }

  static async #onAddCard(event, target) {
    const actor = this.actor;
    if (!actor) return;
    const pack = game.packs.get(target.dataset.pack);
    const doc = await pack?.getDocument(target.dataset.id);
    if (!doc) return;
    if (actor.items.some((i) => i.type === doc.type && i.name === doc.name)) {
      ui.notifications.info(game.i18n.format("ESSENCE.Browser.AlreadyOwned", { actor: actor.name, name: doc.name }));
      return;
    }
    await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
    ui.notifications.info(game.i18n.format("ESSENCE.Browser.Added", { actor: actor.name, name: doc.name }));
    this.render();
  }

  static async #onAddEquipment(event, target) {
    const actor = this.actor;
    if (!actor) return;
    const doc = await fromUuid(target.dataset.uuid);
    if (!doc) return;
    await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
    ui.notifications.info(game.i18n.format("ESSENCE.Browser.Added", { actor: actor.name, name: doc.name }));
  }
}
