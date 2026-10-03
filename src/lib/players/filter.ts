// Who counts as a player in lists, pickers and counts: a player account, or an admin who
// also plays (is_player). Use it as query.or(PLAYERS_FILTER). A second .or() on the same
// query (a name search) is ANDed with it, not mixed into it.
export const PLAYERS_FILTER = "role.eq.player,is_player.eq.true";
