# Reach and the Essence System Economy — Foundry Reference

Canonical reference supplied by the project owner on 2026-09-08, correcting an earlier
implementation mistake that treated Equipment's `tier` field as the Reach gate. Kept verbatim
here so this doesn't regress again — see `computeReachGate()` in `module/utils.mjs` for the code
this governs.

Reach is not a currency. It's not a price tag. It's a character's **tier of economic access**.
Reach Level determines what category of goods and services a character can reasonably obtain.
When equipment tables list what currently reads as "Cost," that label is wrong. It should read
**Reach**. A value of 1 in that column means the item exists at Reach Level 1.

Reach scales with Character Tier — one of three things Tier affects, alongside Signature
Equipment and dice pools. Most characters start at Reach 1. At Tier 4-5, economic resources
alone aren't sufficient — a character also needs opportunity and contacts, not just Reach.

Three economic layers:
- **Reach** — the access layer. A single value.
- **Temporary Influence** — the transaction layer. 5 slots, fixed regardless of Tier.
- **Core Influence** — the damage layer. A 5-box severity track: Light, Light, Serious, Serious,
  Critical.

Critical design rule: having the resources to buy something and having access to that thing are
**separate questions**.

**The One Baseline Exception**: Quartermaster's Due (Warcamp Raised Legacy) lets a character
start with one item whose Tier is no more than 1 higher than Reach would normally allow — it
"proves the rule": a single, named access exception, not a general pattern.

Reach doesn't reset per transaction. It resets between Adventures.

**Implementation note**: the Equipment table column labeled "Cost" (`system.cost` on
`EssenceEquipmentData`, a StringField) is the Reach gate — a tier gate, not a spend value. It has
always been labeled "Reach" wherever the UI shows or edits it. `system.tier` (a NumberField) is
an unrelated field: the sophistication rating used by the Chassis/Fitting/Augment modular
equipment system (see `design/chassis-fitting-augment-system.md`) — it plays no part in Reach
gating and must never be read for that check.
