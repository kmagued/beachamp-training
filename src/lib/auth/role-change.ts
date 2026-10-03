// The access flags that change with a role. A player who becomes an admin keeps playing
// (is_player). A player or coach role already says what they do, so the flag is cleared.
// Coach access follows the old rules: on for coaches, off for players, untouched for admins.
export function roleChangeFlags(from: string, to: string): { is_coach?: boolean; is_player?: boolean } {
  const flags: { is_coach?: boolean; is_player?: boolean } = {};
  if (to === "coach") flags.is_coach = true;
  if (to === "player") flags.is_coach = false;
  if (to === "admin" && from === "player") flags.is_player = true;
  if (to === "player" || to === "coach") flags.is_player = false;
  return flags;
}
