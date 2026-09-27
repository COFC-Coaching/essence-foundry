/**
 * Add Condition dialog (design/css-migration-plan.md step 7, 0.17.0).
 *
 * A DialogV2 that lists the Conditions compendium in two groups, Ordinary and Specialty, with a
 * Foundry SearchFilter across both. Clicking a row adds that Condition through the same path the
 * Token HUD uses (EssenceActor#toggleStatusEffect with the status id essence.mjs registered from the
 * compendium index), so the owned Item carries the statusId flag and the HUD icon lights up. Rows
 * already on the sheet are marked and disabled. The dialog stays open so several Conditions can be
 * added in one visit; Custom Condition creates a blank owned Condition Item and opens its editor.
 *
 * Wound, Consequence and Cover Conditions are left out: Apply Damage, the Influence Injury flow and
 * the Cover rules attach those themselves.
 */

const { DialogV2 } = foundry.applications.api;
const { SearchFilter } = foundry.applications.ux;

const GROUPS = [
  { key: "ordinary", classifications: ["ordinary", "other"], label: "ESSENCE.Sheet.ConditionsOrdinary", hint: "ESSENCE.Sheet.ConditionsOrdinaryHint" },
  { key: "specialty", classifications: ["specialty"], label: "ESSENCE.Sheet.ConditionsSpecialty", hint: "ESSENCE.Sheet.ConditionsSpecialtyHint" }
];

/** The same slug essence.mjs's "ready" hook uses for CONFIG.statusEffects ids. */
function statusIdFor(name) {
  return `essence-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function onSheet(actor, name, statusId) {
  const upper = name.toUpperCase();
  return actor.items.some((i) => i.type === "condition"
    && (i.getFlag("essence-system", "statusId") === statusId || (i.name || "").toUpperCase() === upper));
}

async function loadIndex() {
  const pack = game.packs.get("essence-system.conditions");
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["img", "system.classification"] });
  return [...index].sort((a, b) => a.name.localeCompare(b.name));
}

function rowHtml(actor, entry) {
  const statusId = statusIdFor(entry.name);
  const owned = onSheet(actor, entry.name, statusId);
  const esc = foundry.utils.escapeHTML;
  return `<li class="condition-pick" data-condition-name="${esc(entry.name)}">
    <button type="button" class="condition-pick-add" data-status-id="${statusId}" ${owned ? "disabled" : ""}>
      <img src="${esc(entry.img || "icons/svg/skull.svg")}" alt="" width="20" height="20">
      <span class="condition-pick-name">${esc(entry.name)}</span>
      ${owned ? `<span class="tag condition-pick-owned">${game.i18n.localize("ESSENCE.Sheet.OnSheet")}</span>` : ""}
    </button>
  </li>`;
}

function contentHtml(actor, index) {
  const i18n = game.i18n;
  const groups = GROUPS.map((g) => {
    const rows = index.filter((e) => g.classifications.includes(e.system?.classification ?? "other"));
    if (!rows.length) return "";
    return `<section class="condition-pick-group">
      <h4 class="section-subhead">${i18n.localize(g.label)} <span class="muted">${i18n.localize(g.hint)}</span></h4>
      <ul class="item-list condition-pick-list">${rows.map((e) => rowHtml(actor, e)).join("")}</ul>
    </section>`;
  }).join("");
  return `<div class="essence condition-picker">
    <input type="search" class="condition-pick-search" placeholder="${i18n.format("ESSENCE.Sheet.SearchConditions", { n: index.length })}" autofocus>
    <div class="condition-pick-body">${groups || `<p class="muted">${i18n.localize("ESSENCE.Sheet.NoConditionsInPack")}</p>`}</div>
  </div>`;
}

/**
 * Opens the picker for an actor. Resolves when the dialog closes.
 * @param {Actor} actor
 */
export async function pickConditions(actor) {
  const index = await loadIndex();
  const search = new SearchFilter({
    inputSelector: ".condition-pick-search",
    contentSelector: ".condition-pick-body",
    callback: (event, query, rgx, html) => {
      if (!html) return;
      for (const li of html.querySelectorAll("li[data-condition-name]")) {
        li.hidden = !!query && !rgx.test(SearchFilter.cleanQuery(li.dataset.conditionName));
      }
      for (const group of html.querySelectorAll(".condition-pick-group")) {
        group.hidden = ![...group.querySelectorAll("li[data-condition-name]")].some((li) => !li.hidden);
      }
    }
  });

  await DialogV2.wait({
    window: { title: game.i18n.localize("ESSENCE.Sheet.AddCondition"), icon: "fa-solid fa-heart-crack" },
    classes: ["essence", "essence-condition-picker"],
    position: { width: 520 },
    content: contentHtml(actor, index),
    buttons: [
      {
        action: "custom",
        label: game.i18n.localize("ESSENCE.Sheet.CustomCondition"),
        icon: "fa-solid fa-pen",
        callback: async () => {
          const [item] = await actor.createEmbeddedDocuments("Item", [{
            name: game.i18n.localize("ESSENCE.Sheet.NewCondition"), type: "condition", img: "icons/svg/skull.svg",
            system: { classification: "other", sections: [{ label: "EFFECT", html: "" }] }
          }]);
          item?.sheet?.render(true);
        }
      },
      { action: "close", label: game.i18n.localize("ESSENCE.Common.Close"), icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element;
      search.bind(root);
      root.querySelector(".condition-pick-body")?.addEventListener("click", async (ev) => {
        const button = ev.target.closest(".condition-pick-add");
        if (!button || button.disabled) return;
        button.disabled = true;
        const created = await actor.toggleStatusEffect(button.dataset.statusId, { active: true });
        if (created) {
          button.insertAdjacentHTML("beforeend", `<span class="tag condition-pick-owned">${game.i18n.localize("ESSENCE.Sheet.OnSheet")}</span>`);
        } else {
          button.disabled = false;
        }
      });
    }
  });
}
