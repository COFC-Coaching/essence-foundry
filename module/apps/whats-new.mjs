/**
 * Posts a "What's New" chat card the first time each client loads a session on a new system
 * version — not a native Foundry feature (there's no built-in changelog UI), but a common pattern
 * other systems build for themselves. Reuses CHANGELOG.md as the single source of truth rather
 * than maintaining a second, separately-authored summary that could drift out of sync with it (see
 * this project's existing multi-copy-drift problem with the rulebook itself, per the
 * sync-rules-docs skill) — CHANGELOG.md is shipped in the release zip specifically for this.
 *
 * Scope is "client" (per browser/user profile), not "world": every player and the GM each see the
 * card once on their own next login after an update, rather than once total for the whole world or
 * every single time anyone loads the game.
 */

const SETTING_KEY = "lastSeenVersion";

export function registerWhatsNewSetting() {
  game.settings.register("essence-system", SETTING_KEY, {
    scope: "client", config: false, type: String, default: ""
  });
}

/** Turns the small subset of Markdown CHANGELOG.md actually uses (bold, inline code, paragraphs,
 *  "- " bullet lists) into HTML — not a general Markdown parser, just enough for this one file. */
function markdownToHtml(text) {
  // CHANGELOG.md is checked out with CRLF line endings on Windows — normalize first, since a
  // stray trailing \r survives a plain split("\n") and \r is a line terminator regex's `.` won't
  // cross, breaking any **bold** span that happens to wrap a line break.
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const inline = (s) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

  const blocks = text.trim().split(/\n\s*\n/);
  const html = blocks.map((block) => {
    const lines = block.trim().split("\n");
    if (lines.every((l) => /^-\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^-\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${inline(lines.join(" "))}</p>`;
  });
  return html.join("");
}

/** Extracts the `## <version>` section for `version` out of the full CHANGELOG.md text. */
function extractChangelogEntry(changelog, version) {
  const marker = `## ${version}`;
  const start = changelog.indexOf(marker);
  if (start === -1) return null;
  const afterHeading = changelog.indexOf("\n", start) + 1;
  const nextHeading = changelog.indexOf("\n## ", afterHeading);
  const body = changelog.slice(afterHeading, nextHeading === -1 ? undefined : nextHeading);
  return body.trim();
}

async function buildCard(version) {
  let entry;
  try {
    // foundry.utils.getRoute (not a bare relative fetch) correctly respects a world hosted under
    // a routePrefix, matching how core resolves its own system/module asset URLs.
    const res = await fetch(foundry.utils.getRoute("systems/essence-system/CHANGELOG.md"));
    if (!res.ok) throw new Error(`${res.status}`);
    entry = extractChangelogEntry(await res.text(), version);
  } catch (err) {
    console.warn("Essence System | Couldn't load CHANGELOG.md for the What's New card:", err);
  }
  const body = entry
    ? markdownToHtml(entry)
    : `<p>See the <a href="https://github.com/COFC-Coaching/essence-foundry/releases/tag/v${version}" target="_blank">release notes</a> for what changed.</p>`;

  return `
    <div class="essence-whats-new">
      <div class="essence-whats-new-header">
        <i class="fa-solid fa-dice-d10"></i>
        <div>
          <div class="essence-whats-new-title">The Essence System has updated</div>
          <div class="essence-whats-new-version">v${version}</div>
        </div>
      </div>
      <div class="essence-whats-new-body">${body}</div>
    </div>
  `;
}

/** Call once from the "ready" hook. */
export async function checkWhatsNew() {
  const currentVersion = game.system.version;
  const lastSeen = game.settings.get("essence-system", SETTING_KEY);
  if (lastSeen === currentVersion) return;

  // A brand-new world/user (no lastSeen recorded yet) has nothing to compare against and nothing
  // useful to announce — just baseline them to the current version silently instead of showing a
  // card on their very first-ever login.
  if (lastSeen) {
    const content = await buildCard(currentVersion);
    await ChatMessage.create({
      whisper: [game.user.id],
      speaker: { alias: "The Essence System" },
      content
    });
  }
  await game.settings.set("essence-system", SETTING_KEY, currentVersion);
}
