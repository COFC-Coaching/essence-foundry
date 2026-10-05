/**
 * Granted Equipment Card text <-> structured fields.
 *
 * A Chassis/Fitting/Function Augment that grants an Equipment Card stores the whole card as one
 * HTML blob in its own `system.effect` (scripts/component-catalog-data.json writes every one to the
 * same template: an intro line, the card's name and code, a stat line, then Resolution / Range /
 * Trigger / Effect / Surges / Design note paragraphs). That blob is what the Combat tab plays and
 * what chat prints, and equipmentCardCommitment (utils.mjs) reads "Roll N+" / "burn N" straight
 * out of it — so the editable form on the equipment sheet does NOT get its own schema. It parses
 * the blob into fields for editing and writes the very same template back, so every reader of the
 * text keeps working and nothing on a live world needs migrating. Text the template doesn't know
 * (a hand-written paragraph) is kept verbatim in `extra` and re-emitted after the known lines, so
 * an edit through the form never silently drops anything.
 *
 * Template (one <p> per line; "•" is the stat-line separator):
 *   <p><strong>{introLabel}</strong> {intro}</p>
 *   <p><strong>{name}</strong> ({code})</p>
 *   <p><em>{ACTION|REACTION} • {Roll {roll}+ | Burn {roll}} • USES {uses|—} • RESOURCE {resource}</em></p>
 *   ("Roll N+" is a rolled card with a minimum of N dice; "Burn N" burns N dice with no roll —
 *   the two shapes equipmentCardCommitment in utils.mjs reads off the text.)
 *   <p><strong>Resolution:</strong> …</p>
 *   <p><strong>Range / Targeting:</strong> …</p>
 *   <p><strong>Trigger:</strong> …</p>
 *   <p><strong>Effect:</strong> …</p>
 *   <p><strong>Surge {n}: {text}</strong></p>   (repeated)
 *   <p><em>Design note: …</em></p>
 */

const BULLET = "•";
const DEFAULT_INTRO_LABEL = "This part's effect:";

/** @returns {EquipmentCardModel} a blank card in the template's shape */
export function emptyEquipmentCard() {
  return {
    structured: false,
    introLabel: DEFAULT_INTRO_LABEL, intro: "",
    name: "", code: "",
    kind: "reaction", dice: "roll", roll: 2, uses: null, resource: 0,
    resolution: "", range: "", trigger: "", effect: "",
    surges: [], note: "",
    extra: ""
  };
}

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * @param {string} html - a granting Component's `system.effect`
 * @returns {EquipmentCardModel} `structured` is true when the blob carries at least the card's
 *   name line, stat line or Effect line — i.e. it was written to the template and the form can
 *   round-trip it. Anything else should be edited as free text instead.
 */
export function parseEquipmentCard(html) {
  const model = emptyEquipmentCard();
  if (!html?.trim()) return model;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const extras = [];
  let hits = 0;
  const children = [...doc.body.children];
  for (const el of children) {
    if (el.tagName !== "P") { extras.push(el.outerHTML); continue; }
    const strong = el.querySelector(":scope > strong");
    const em = el.querySelector(":scope > em");
    const onlyChild = el.children.length === 1 && text(el) === text(el.firstElementChild);
    const label = strong ? text(strong) : "";
    const rest = strong ? text(el).slice(label.length).trim() : "";

    // Stat line: "REACTION • Roll 2+ • USES — • RESOURCE 0"
    if (em && onlyChild && /^(action|reaction)\b/i.test(text(em))) {
      const parts = text(em).split(BULLET).map((p) => p.trim());
      model.kind = /^reaction/i.test(parts[0]) ? "reaction" : "action";
      for (const p of parts.slice(1)) {
        let m;
        if ((m = /^roll\s+(\d+)/i.exec(p))) { model.dice = "roll"; model.roll = Number(m[1]); }
        else if ((m = /^burn\s+(\d+)/i.exec(p))) { model.dice = "burn"; model.roll = Number(m[1]); }
        else if ((m = /^uses\s+(.*)$/i.exec(p))) model.uses = /^\d+$/.test(m[1]) ? Number(m[1]) : null;
        else if ((m = /^resource\s+(\d+)/i.exec(p))) model.resource = Number(m[1]);
      }
      hits++; continue;
    }
    // Design note
    if (em && onlyChild && /^design note:/i.test(text(em))) {
      model.note = text(em).replace(/^design note:\s*/i, ""); continue;
    }
    if (strong) {
      // Surge lines are wholly bold: "<strong>Surge 1: text</strong>"
      let m;
      if (onlyChild && (m = /^surge\s+(\d+)\s*:\s*(.*)$/i.exec(label))) {
        model.surges.push({ n: Number(m[1]), text: m[2] }); continue;
      }
      if (/effect:$/i.test(label) && !/^effect:$/i.test(label)) {
        model.introLabel = label; model.intro = rest; continue;
      }
      // Name line: "<strong>Equipment Guard</strong> (EC01)" — bold name, optional code after it
      if (!/:$/.test(label) && (m = /^\(?([A-Za-z0-9-]*)\)?$/.exec(rest))) {
        model.name = label; model.code = m[1] ?? ""; hits++; continue;
      }
      if (/^resolution:$/i.test(label)) { model.resolution = rest; continue; }
      if (/^range(\s*\/\s*targeting)?:$/i.test(label)) { model.range = rest; continue; }
      if (/^trigger:$/i.test(label)) { model.trigger = rest; continue; }
      if (/^effect:$/i.test(label)) { model.effect = rest; hits++; continue; }
    }
    extras.push(el.outerHTML);
  }
  model.extra = extras.join("");
  model.structured = hits > 0;
  return model;
}

/**
 * @param {EquipmentCardModel} model
 * @returns {string} the template HTML (see file comment). Empty optional lines are left out so a
 *   card without a Trigger or Design note stays as compact as the catalog's own.
 */
export function renderEquipmentCard(model) {
  const lines = [];
  if (model.intro) lines.push(`<p><strong>${esc(model.introLabel || DEFAULT_INTRO_LABEL)}</strong> ${esc(model.intro)}</p>`);
  if (model.name) lines.push(`<p><strong>${esc(model.name)}</strong>${model.code ? ` (${esc(model.code)})` : ""}</p>`);
  const kind = model.kind === "action" ? "ACTION" : "REACTION";
  const roll = Number.isFinite(model.roll) ? Math.max(2, model.roll) : 2;
  const uses = Number.isFinite(model.uses) && model.uses !== null ? model.uses : "—";
  const resource = Number.isFinite(model.resource) ? model.resource : 0;
  const dice = model.dice === "burn" ? `Burn ${roll}` : `Roll ${roll}+`;
  lines.push(`<p><em>${kind} ${BULLET} ${dice} ${BULLET} USES ${uses} ${BULLET} RESOURCE ${resource}</em></p>`);
  if (model.resolution) lines.push(`<p><strong>Resolution:</strong> ${esc(model.resolution)}</p>`);
  if (model.range) lines.push(`<p><strong>Range / Targeting:</strong> ${esc(model.range)}</p>`);
  if (model.trigger) lines.push(`<p><strong>Trigger:</strong> ${esc(model.trigger)}</p>`);
  if (model.effect) lines.push(`<p><strong>Effect:</strong> ${esc(model.effect)}</p>`);
  for (const s of model.surges ?? []) {
    if (!s.text) continue;
    lines.push(`<p><strong>Surge ${Number.isFinite(s.n) ? s.n : 1}: ${esc(s.text)}</strong></p>`);
  }
  if (model.note) lines.push(`<p><em>Design note: ${esc(model.note)}</em></p>`);
  if (model.extra) lines.push(model.extra);
  return lines.join("");
}

/**
 * @typedef {object} EquipmentCardModel
 * @property {boolean} structured
 * @property {string} introLabel  e.g. "This Grip's effect:"
 * @property {string} intro
 * @property {string} name        the card's name, e.g. "Equipment Guard"
 * @property {string} code        e.g. "EC01"
 * @property {"action"|"reaction"} kind
 * @property {"roll"|"burn"} dice "Roll N+" (rolled, minimum N dice) or "Burn N" (burn N, no roll)
 * @property {number} roll        the N above
 * @property {number|null} uses   null prints as "—" (unlimited)
 * @property {number} resource
 * @property {string} resolution
 * @property {string} range
 * @property {string} trigger
 * @property {string} effect
 * @property {Array<{n: number, text: string}>} surges
 * @property {string} note
 * @property {string} extra       verbatim HTML the template didn't recognise
 */
