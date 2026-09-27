import { migrateSource } from "./migration.mjs";

const { fields } = foundry.data;

/** Minimum and maximum Team Tier: "Tiers 1 through 5" (Doc L2259). */
export const TEAM_TIER_MIN = 1;
export const TEAM_TIER_MAX = 5;

/** Suggested descriptive tags for a Things and Commitments entry (Doc L2263). Tags coexist and are
 *  free text; these only seed the sheet's suggestion list. */
export const TEAM_RECORD_TAGS = ["Asset", "Obligation", "Borrowed", "Pledged"];

/** Suggested relationship terms for an Organization (Doc L2269): "Friendly, Neutral, Hostile, or
 *  more specific terms". Free text; these only seed the suggestion list. */
export const TEAM_RELATIONSHIPS = ["Friendly", "Neutral", "Hostile"];

/**
 * The Team (v0.6 Part IV "Creating the Team" and "Team Tier and the Team Record", Doc L2179-2290).
 *
 * A Team is its own Actor so the group's Tier and record live in one place, the way the Doc puts
 * them: "Team Tier belongs on the Team record" (L764), with a Team sheet among the play aids
 * (L8257). Before v0.6 each character had a personal Tier; that field is now legacy
 * (actor-combatant.mjs).
 *
 * Membership is a list of member Actor ids held here, not a field on each character. Adding or
 * removing a member is then one update to one document, and a character never has to be written
 * to join. `teamForActor()` in utils.mjs finds a character's Team.
 *
 * Team Tier only increases (L2283). An increase clears every member's Temporary Influence (L2287).
 * Both rules are enforced here in the document's own update lifecycle, so they hold however the
 * Tier is changed.
 */
export default class EssenceTeamData extends foundry.abstract.TypeDataModel {
  /** See module/data/migration.mjs. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

  static defineSchema() {
    return {
      tier: new fields.NumberField({ required: true, integer: true, initial: TEAM_TIER_MIN, min: TEAM_TIER_MIN, max: TEAM_TIER_MAX }),

      // Creating the Team (L2179-2229). None of these grant mechanical benefits; they give the
      // table a shared starting point ("Its purpose is clarity").
      identity: new fields.StringField({ initial: "" }),
      reasonToCooperate: new fields.HTMLField({ initial: "" }),
      majorGoal: new fields.HTMLField({ initial: "" }),
      methods: new fields.HTMLField({ initial: "" }),
      principles: new fields.HTMLField({ initial: "" }),
      decisions: new fields.HTMLField({ initial: "" }),
      roles: new fields.HTMLField({ initial: "" }),

      // Actor ids of the member characters.
      members: new fields.ArrayField(new fields.StringField({ blank: false })),

      // Things and Commitments (L2263-2265): what the Team can do with it, what using or
      // maintaining it requires, and what could change the arrangement, all in `notes`.
      things: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        tags: new fields.StringField({ initial: "" }),
        notes: new fields.StringField({ initial: "" })
      })),

      // Organizations and Relationships (L2267-2271): what the organization offers, what it
      // wants, and what could improve or damage the relationship, all in `notes`.
      organizations: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        relationship: new fields.StringField({ initial: "" }),
        notes: new fields.StringField({ initial: "" })
      }))
    };
  }

  /**
   * Team Tier "only increases" and "The GM raises it" (L2283). A decrease, or a change by a
   * non-GM, is removed from the update with a notice rather than failing the whole update, so an
   * unrelated edit submitted in the same form still saves. The one exception is a GM correction
   * (`options.essenceTierCorrection`), for fixing a mistake rather than changing the Team's scale.
   */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    const next = changes.system?.tier;
    if (next === undefined) return;
    const current = this.tier ?? TEAM_TIER_MIN;
    const target = Number(next);
    // A GM's explicit correction (the sheet's "Correct" control) fixes a data-entry mistake. It is
    // not a rules increase or decrease, so it may go either way and clears nothing.
    if (options.essenceTierCorrection && user.isGM) return;
    if (!user.isGM || !(target >= current)) {
      delete changes.system.tier;
      if (user.id === game.user.id) {
        ui.notifications.warn(game.i18n.localize(user.isGM ? "ESSENCE.Team.TierOnlyIncreases" : "ESSENCE.Team.TierGMOnly"));
        // Nothing may be left to save, so no re-render would follow and the sheet would keep
        // showing the refused value. Re-render it from the stored Tier.
        if (this.parent?.sheet?.rendered) this.parent.sheet.render();
      }
      return;
    }
    if (target > current) options.essenceTeamTierRaised = { from: current, to: target };
  }

  /** On an increase, clear every member's Temporary Influence (L2287). Runs once, on the client
   *  that made the change (always a GM, per _preUpdate), which can write to every member. */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const raised = options.essenceTeamTierRaised;
    if (raised && userId === game.user.id) this.#clearMembersTemporaryInfluence(raised);
  }

  async #clearMembersTemporaryInfluence({ from, to }) {
    const cleared = [];
    for (const member of this.memberActors) {
      if (!member.system?.playState) continue;
      await member.update({ "system.playState.currentTemporaryInfluence": 0 });
      cleared.push(member.name);
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.parent }),
      content: `<p>${game.i18n.format("ESSENCE.Team.TierRaisedChat", {
        team: this.parent.name, from, to,
        members: cleared.length ? cleared.join(", ") : game.i18n.localize("ESSENCE.Team.NoMembers")
      })}</p>`
    });
  }

  /** The member Actors that still exist (a deleted Actor's id is skipped, not an error). */
  get memberActors() {
    return (this.members ?? []).map((id) => game.actors?.get(id)).filter(Boolean);
  }
}
