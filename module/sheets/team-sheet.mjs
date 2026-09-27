import { TEAM_TIER_MIN, TEAM_TIER_MAX, TEAM_RECORD_TAGS, TEAM_RELATIONSHIPS } from "../data/actor-team.mjs";
import { teamForActor } from "../utils.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Blank rows for the two Team record lists. */
const RECORD_ROW_DEFAULTS = {
  things: { name: "", tags: "", notes: "" },
  organizations: { name: "", relationship: "", notes: "" }
};

/**
 * The Team sheet (module/data/actor-team.mjs), in three tabs:
 * - Team: Team Tier, Identity and members. This is what a GM consults during play.
 * - Record: Things and Commitments; Organizations and Relationships.
 * - Charter: the six agreements from "Creating the Team", written once and rarely reread.
 *
 * Team Tier is a read-only number with two GM-only controls, not an input. Raising it is
 * permanent under the rules and clears every member's Temporary Influence, so it goes through a
 * confirmation that names what will be cleared. "Correct" fixes a genuine data-entry mistake
 * without clearing anything (actor-team.mjs `essenceTierCorrection`).
 *
 * Members are added by dragging a character onto the sheet, through ActorSheetV2's own
 * `_onDropActor` hook. A character is on at most one Team: dropping it here moves it.
 *
 * Like the other sheets, fields are locked until the edit lock is opened; action buttons stay live.
 * Record rows are NOT bound with dotted `name="system.things.0.notes"` inputs, because Foundry's
 * form submission resets an array element's sibling fields (build-history, Recurring bug patterns
 * #1). Each row input carries data-array/-index/-record-field and a change listener rewrites the
 * whole array.
 */
export default class EssenceTeamSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "team"],
    position: { width: 680, height: 640 },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      changeTab: EssenceTeamSheet.#onChangeTab,
      toggleEditLock: EssenceTeamSheet.#onToggleEditLock,
      raiseTier: EssenceTeamSheet.#onRaiseTier,
      correctTier: EssenceTeamSheet.#onCorrectTier,
      addRecordRow: EssenceTeamSheet.#onAddRecordRow,
      deleteRecordRow: EssenceTeamSheet.#onDeleteRecordRow,
      openMember: EssenceTeamSheet.#onOpenMember,
      removeMember: EssenceTeamSheet.#onRemoveMember,
      removeMissingMembers: EssenceTeamSheet.#onRemoveMissingMembers
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/team-sheet.hbs" }
  };

  #activeTab = "team";
  #editUnlocked = false;
  /** Set by "Add" so the next render focuses the new row's Name field. */
  #focusNewRow = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    context.actor = this.actor;
    context.system = system;
    context.isGM = game.user.isGM;
    context.editUnlocked = this.#editUnlocked;
    context.canRaiseTier = game.user.isGM && system.tier < TEAM_TIER_MAX;
    context.tierMax = TEAM_TIER_MAX;
    context.recordTags = TEAM_RECORD_TAGS;
    context.relationships = TEAM_RELATIONSHIPS;
    context.members = system.memberActors.map((a) => ({
      id: a.id,
      name: a.name,
      img: a.img,
      level: a.system.level ?? 1,
      temporaryInfluence: a.system.playState?.currentTemporaryInfluence ?? 0
    }));
    context.missingMembers = (system.members ?? []).length - context.members.length;
    context.things = system.things.map((row, i) => ({ ...row, i }));
    context.organizations = system.organizations.map((row, i) => ({ ...row, i }));
    context.charterEmpty = ["reasonToCooperate", "majorGoal", "methods", "principles", "decisions", "roles"]
      .every((k) => !String(system[k] ?? "").replace(/<[^>]*>/g, "").trim());
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-record-field]")) {
      el.addEventListener("change", (event) => this.#onRecordFieldChange(event));
    }
    this.#applyActiveTab();
    this.#applyEditable();
    if (this.#focusNewRow) {
      const { key, index } = this.#focusNewRow;
      this.#focusNewRow = null;
      this.element.querySelector(`[data-array="${key}"][data-index="${index}"][data-record-field="name"]`)?.focus();
    }
  }

  #applyActiveTab() {
    for (const link of this.element.querySelectorAll('.sheet-tabs [data-action="changeTab"]')) {
      const active = link.dataset.tab === this.#activeTab;
      link.classList.toggle("active", active);
      link.setAttribute("aria-selected", String(active));
    }
    for (const section of this.element.querySelectorAll("section.tab")) {
      section.classList.toggle("active", section.dataset.tab === this.#activeTab);
    }
  }

  /** Mirrors the other sheets: fields lock until the edit lock is opened; buttons stay live. */
  #applyEditable() {
    const body = this.element.querySelector(".window-content") ?? this.element;
    const lockFields = !this.isEditable || !this.#editUnlocked;
    if (lockFields) {
      for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
    }
  }

  /** Read-modify-write of the whole record array for one changed cell (see class comment). */
  async #onRecordFieldChange(event) {
    event.stopPropagation();
    const el = event.currentTarget;
    const key = el.dataset.array;
    const i = Number(el.dataset.index);
    const rows = this.actor.system[key].map((row) => foundry.utils.deepClone(row));
    if (!rows[i]) return;
    rows[i][el.dataset.recordField] = el.value;
    await this.actor.update({ [`system.${key}`]: rows });
  }

  /** Dropping a character adds it as a member (and removes it from any other Team). */
  async _onDropActor(event, actor) {
    if (!this.isEditable || actor.type !== "character") return null;
    const members = this.actor.system.members ?? [];
    if (members.includes(actor.id)) return actor;
    const previous = teamForActor(actor);
    if (previous && previous.id !== this.actor.id) {
      await previous.update({ "system.members": previous.system.members.filter((id) => id !== actor.id) });
      ui.notifications.info(game.i18n.format("ESSENCE.Team.MovedMember", { name: actor.name, from: previous.name, to: this.actor.name }));
    }
    await this.actor.update({ "system.members": [...members, actor.id] });
    return actor;
  }

  /** A Team holds no Items. */
  async _onDropItem(event, item) {
    return null;
  }

  static #onChangeTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.#applyActiveTab();
  }

  static #onToggleEditLock() {
    this.#editUnlocked = !this.#editUnlocked;
    this.render();
  }

  /** GM-only: raise Team Tier by 1 after confirming whose Temporary Influence will be cleared. */
  static async #onRaiseTier() {
    const system = this.actor.system;
    if (!game.user.isGM || system.tier >= TEAM_TIER_MAX) return;
    const next = system.tier + 1;
    const holders = system.memberActors
      .map((a) => ({ name: a.name, ti: a.system.playState?.currentTemporaryInfluence ?? 0 }))
      .filter((m) => m.ti > 0);
    const list = holders.length
      ? `<ul>${holders.map((m) => `<li>${foundry.utils.escapeHTML(m.name)}: ${m.ti}</li>`).join("")}</ul>`
      : `<p>${game.i18n.localize("ESSENCE.Team.RaiseNoInfluence")}</p>`;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.format("ESSENCE.Team.RaiseTitle", { tier: next }) },
      content: `<p>${game.i18n.format("ESSENCE.Team.RaiseBody", { team: foundry.utils.escapeHTML(this.actor.name), from: system.tier, to: next })}</p>${list}`,
      yes: { label: game.i18n.format("ESSENCE.Team.RaiseConfirm", { tier: next }), default: false },
      no: { label: game.i18n.localize("ESSENCE.Common.Cancel"), default: true }
    });
    if (confirmed) await this.actor.update({ "system.tier": next });
  }

  /** GM-only: set Team Tier directly to fix a data-entry mistake. Not a rules change: it clears
   *  nothing and posts no raise message (actor-team.mjs honours `essenceTierCorrection`). */
  static async #onCorrectTier() {
    if (!game.user.isGM) return;
    const current = this.actor.system.tier;
    const value = await DialogV2.prompt({
      window: { title: game.i18n.localize("ESSENCE.Team.CorrectTitle") },
      content: `<p>${game.i18n.localize("ESSENCE.Team.CorrectBody")}</p>
        <label>${game.i18n.localize("ESSENCE.Team.Tier")}
          <input type="number" name="tier" min="${TEAM_TIER_MIN}" max="${TEAM_TIER_MAX}" value="${current}" autofocus>
        </label>`,
      ok: {
        label: game.i18n.localize("ESSENCE.Team.CorrectConfirm"),
        callback: (event, button) => Number(button.form.elements.tier.value)
      },
      rejectClose: false
    });
    if (!Number.isInteger(value) || value === current) return;
    const tier = Math.min(TEAM_TIER_MAX, Math.max(TEAM_TIER_MIN, value));
    await this.actor.update({ "system.tier": tier }, { essenceTierCorrection: true });
  }

  static async #onAddRecordRow(event, target) {
    const key = target.dataset.array;
    const rows = this.actor.system[key].map((row) => foundry.utils.deepClone(row));
    rows.push(foundry.utils.deepClone(RECORD_ROW_DEFAULTS[key]));
    // A new row is for typing into, so open the edit lock and focus its Name field.
    this.#editUnlocked = true;
    this.#focusNewRow = { key, index: rows.length - 1 };
    await this.actor.update({ [`system.${key}`]: rows });
  }

  static async #onDeleteRecordRow(event, target) {
    const key = target.dataset.array;
    const rows = this.actor.system[key].map((row) => foundry.utils.deepClone(row));
    rows.splice(Number(target.dataset.index), 1);
    await this.actor.update({ [`system.${key}`]: rows });
  }

  static #onOpenMember(event, target) {
    game.actors.get(target.dataset.actorId)?.sheet.render(true);
  }

  static async #onRemoveMember(event, target) {
    const id = target.dataset.actorId;
    await this.actor.update({ "system.members": this.actor.system.members.filter((m) => m !== id) });
  }

  /** Drops ids of member actors that were deleted from the world. */
  static async #onRemoveMissingMembers() {
    await this.actor.update({ "system.members": this.actor.system.members.filter((id) => game.actors.get(id)) });
  }
}
