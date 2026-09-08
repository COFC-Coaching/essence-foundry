/** "might" -> "Might". Attribute/skill keys are stored lowercase; every player-facing label built from one needs this. */
export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}
