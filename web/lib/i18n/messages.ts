// UI copy, one flat key per string. The `en` dictionary is the source of truth:
// `es` is typed against it, so a missing or stale key is a compile error.
//
// Only chrome is translated — player handles, teams, champions, countries and
// roles come from the DB and read the same in both languages.

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

// The static HTML is built in this locale; anything else is swapped in on the
// client after hydration.
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

const en = {
  // --- Header / footer ---
  "nav.search": "Search",
  "nav.leaderboards": "Leaderboards",
  "nav.players": "Players",
  "nav.champions": "Champions",
  "nav.records": "Records",
  "footer.credits":
    "Data from Leaguepedia (CC BY-SA 4.0) · Oracle's Elixir (Tim Sevenhuysen) · A fan project, not affiliated with Riot Games.",
  "locale.label": "Change language",

  // --- Shared ---
  "common.back": "Back",
  "common.player": "Player",
  "common.value": "Value",
  "common.role": "Role",
  "common.team": "Team",
  "common.games": "Games",
  "common.gamesLower": "games",
  "common.gamesCount": "{n} games",
  "common.winRate": "Win %",
  "common.kda": "KDA",
  "common.winShort": "W",
  "common.lossShort": "L",
  "common.noMatch": "No players match “{q}”.",
  "scope.all": "All roles",

  // --- Home ---
  "home.eyebrow": "League of Legends · Esports almanac",
  "home.title": "Who's smurfing the pro stage?",
  "home.subtitle":
    "Search any professional player to open their profile — smurf score, titles, KDA and champion pool.",
  "home.link.records": "Hall of Records",
  "home.link.leaderboards": "Leaderboards",
  "home.link.players": "All players",
  "home.link.champions": "Champions",
  "home.search.placeholder": "Search a pro player…",
  "home.search.aria": "Search a pro player",

  // --- Players ---
  "players.eyebrow": "Every name on record",
  "players.title": "Players",
  "players.subtitle":
    "{count} players from the international stage and the domestic leagues. Search by name, team or role.",
  "players.search.placeholder": "Search a player, team or role…",
  "players.search.aria": "Search players",
  "players.card.intlTitles": "International titles",
  "players.card.legacyScore": "Smurf score",
  "players.showing":
    "Showing {shown} of {total} — refine your search to narrow it down.",

  // --- Champions ---
  "champions.eyebrow": "The pick & ban stage",
  "champions.title": "Champions",
  "champions.subtitle":
    "Every champion on the international stage — most picked, best win rate and KDA. Sort the table or raise the minimum games.",
  "champions.minGames": "Min. games",
  "champions.champion": "Champion",
  "champions.players": "Players",
  "champions.empty": "No champions above {n} games yet.",

  // --- Leaderboards ---
  "leaderboards.eyebrow": "Too good for their own league",
  "leaderboards.title": "Leaderboards",
  "leaderboards.subtitle":
    "Pick a category, filter by role and sort the table. Every record shows its minimum-games threshold to keep it honest.",
  "leaderboards.empty":
    "Not enough data for this leaderboard yet. The ETL is still loading — try reloading in a little while.",
  "leaderboards.category": "Category",
  "leaderboards.role": "Role",
  "leaderboards.showAll": "Show all {n} ▾",
  "leaderboards.showTop": "Show top 20 ▴",
  "podium.first": "First",
  "podium.second": "Second",
  "podium.third": "Third",

  // --- Records ---
  "records.eyebrow": "The all-time record book",
  "records.title": "Hall of Records",
  "records.subtitle":
    "The headline marks of international League of Legends — the very best on the game's biggest stages.",
  "records.empty":
    "No data yet. The ETL is filling the hall of records — reload in a little while.",

  // --- Player profile ---
  "player.retired": "Retired",
  "player.legacyScore": "Smurf score",
  "player.rank": "#{rank} of {total}",
  "player.recordsHeld": "Records held",
  "player.teamHistory": "Team history",
  "player.trophyCase": "Trophy case",
  "player.championPool": "Champion pool",
  "player.tile.games": "Games",
  "player.tile.careerKda": "Career KDA",
  "player.tile.winRate": "Win rate",
  "player.tile.intlTitles": "Intl. titles",
  "player.tile.worldsTitles": "Worlds titles",
  "player.breakdown.titles": "Titles",
  "player.breakdown.stage": "Stage",
  "player.breakdown.longevity": "Longevity",
  "player.breakdown.performance": "Performance",

  // --- Stat catalog (label / short column header / help text) ---
  "stat.legacy_score.label": "Smurf score",
  "stat.legacy_score.short": "Score",
  "stat.legacy_score.help":
    "A composite greatness rating: international titles (Worlds > MSI > others), Worlds appearances, longevity and elite KDA on the big stage. The higher it is, the harder they're smurfing.",
  "stat.career_kda.label": "Best career KDA",
  "stat.career_kda.short": "KDA",
  "stat.career_kda.help":
    "(Kills + Assists) / Deaths, from career totals. Minimum 200 games internationally, 100 in a regional league.",
  "stat.career_kda_intl.label": "Best KDA at internationals",
  "stat.career_kda_intl.short": "KDA · intl",
  "stat.career_kda_intl.help":
    "Career KDA counting only Worlds / MSI / First Stand games. Minimum 30 games.",
  "stat.intl_titles.label": "Most international titles",
  "stat.intl_titles.short": "Titles",
  "stat.intl_titles.help":
    "Worlds + MSI + First Stand won while on the roster with at least one game played.",
  "stat.worlds_titles.label": "Most Worlds titles",
  "stat.worlds_titles.short": "Worlds",
  "stat.worlds_titles.help": "World Championships won on the winning roster.",
  "stat.msi_titles.label": "Most MSI titles",
  "stat.msi_titles.short": "MSI",
  "stat.msi_titles.help": "Mid-Season Invitationals won on the winning roster.",
  "stat.worlds_appearances.label": "Most Worlds appearances",
  "stat.worlds_appearances.short": "Worlds apps",
  "stat.worlds_appearances.help":
    "Distinct years with at least one Worlds main-event game.",
  "stat.games_played.label": "Most games played",
  "stat.games_played.short": "Games",
  "stat.games_played.help":
    "Total official games played — the longevity record.",
  "stat.career_kills.label": "Most career kills",
  "stat.career_kills.short": "Kills",
  "stat.career_kills.help": "Total kills across an entire career.",
  "stat.win_rate.label": "Best win rate",
  "stat.win_rate.short": "Win %",
  "stat.win_rate.help":
    "Wins / games. Minimum 200 games internationally, 100 in a regional league.",
  // --- Oracle's Elixir: regional leagues and per-timing economy ---
  "stat.gd15.label": "Best gold difference at 15",
  "stat.gd15.short": "GD@15",
  "stat.gd15.help":
    "Average gold lead over the opposing laner at 15 minutes. Averaged over games that carry timing data — minimum 50 of them.",
  "stat.gold15.label": "Most gold at 15",
  "stat.gold15.short": "Gold@15",
  "stat.gold15.help":
    "Average gold held at the 15-minute mark. Same 50-game minimum on games with timing data.",
  "stat.cs_per_min.label": "Best CS per minute",
  "stat.cs_per_min.short": "CS/min",
  "stat.cs_per_min.help":
    "Total creep score divided by total minutes played — not an average of per-game rates. Minimum 100 games.",
  "stat.dpm.label": "Most damage per minute",
  "stat.dpm.short": "DPM",
  "stat.dpm.help":
    "Damage to champions divided by total minutes played, from career totals. Minimum 100 games.",
  "stat.pentakills.label": "Most pentakills",
  "stat.pentakills.short": "Pentas",
  "stat.pentakills.help":
    "Career pentakills, counting domestic leagues and internationals alike.",
  "stat.pentakills.coverage":
    "Pentakills come from Oracle's Elixir, which records no multikills for games it marks incomplete — LPL games from 2022 on are therefore not counted.",
  // --- Leaderboards: universe + region pickers ---
  "leaderboards.scope": "Scope",
  "leaderboards.universe.intl": "International",
  "leaderboards.universe.regional": "Regional",
  "leaderboards.region": "Region",
  "leaderboards.allRegions": "All regions",
  "leaderboards.regionalSource": "Regional data: Oracle's Elixir.",
  // --- Regional-only player profiles ---
  "player.regionalCareer": "Regional career",
  "player.regionalOnly":
    "Domestic play only — no international appearances, so no Smurf Score.",
  "player.tile.gd15": "GD@15",
  "player.tile.csPerMin": "CS/min",

  // --- Scope clarifications: column-header tooltips + per-page notes ---
  "tip.more": "More info",
  "tip.games":
    "Official competitive matches only — never solo queue. All-time totals.",
  "tip.playersGames":
    "Official games on record — international events for players with an international career, domestic leagues for regional-only players. Never solo queue.",
  "tip.winRate": "Wins ÷ games, official competitive matches only, all-time.",
  "tip.kda":
    "(Kills + Assists) ÷ Deaths from career totals — not an average of per-game KDAs.",
  "tip.champGames":
    "Times picked in official competitive games — a champion appears at most once per game. All-time.",
  "tip.champPlayers": "Distinct pros who have played this champion.",
  "scopeNote.official":
    "Official competitive matches only — all-time. Never solo queue.",
  "scopeNote.intl":
    "International events only (Worlds · MSI · First Stand) — official matches, all-time. Never solo queue.",
} as const;

export type MsgKey = keyof typeof en;

// Neutral Spanish (no voseo): the site is read across the whole Spanish-speaking
// scene. Esports jargon that the scene uses in English — Worlds, MSI, KDA,
// winrate, pool, roster, smurf score — is deliberately left untranslated.
const es: Record<MsgKey, string> = {
  "nav.search": "Buscar",
  "nav.leaderboards": "Rankings",
  "nav.players": "Jugadores",
  "nav.champions": "Campeones",
  "nav.records": "Récords",
  "footer.credits":
    "Datos de Leaguepedia (CC BY-SA 4.0) · Oracle's Elixir (Tim Sevenhuysen) · Proyecto de fans, sin relación con Riot Games.",
  "locale.label": "Cambiar idioma",

  "common.back": "Volver",
  "common.player": "Jugador",
  "common.value": "Valor",
  "common.role": "Rol",
  "common.team": "Equipo",
  "common.games": "Partidas",
  "common.gamesLower": "partidas",
  "common.gamesCount": "{n} partidas",
  "common.winRate": "% Vict.",
  "common.kda": "KDA",
  "common.winShort": "V",
  "common.lossShort": "D",
  "common.noMatch": "Ningún jugador coincide con «{q}».",
  "scope.all": "Todos los roles",

  "home.eyebrow": "League of Legends · Récords y estadísticas",
  "home.title": "¿Quién está smurfeando?",
  "home.subtitle":
    "Busca cualquier jugador profesional para abrir su perfil: smurf score, títulos, KDA y pool de campeones.",
  "home.link.records": "Salón de los Récords",
  "home.link.leaderboards": "Rankings",
  "home.link.players": "Todos los jugadores",
  "home.link.champions": "Campeones",
  "home.search.placeholder": "Busca un jugador profesional…",
  "home.search.aria": "Buscar un jugador profesional",

  "players.eyebrow": "Todos los nombres registrados",
  "players.title": "Jugadores",
  "players.subtitle":
    "{count} jugadores del escenario internacional y de las ligas domésticas. Busca por nombre, equipo o rol.",
  "players.search.placeholder": "Busca un jugador, equipo o rol…",
  "players.search.aria": "Buscar jugadores",
  "players.card.intlTitles": "Títulos internacionales",
  "players.card.legacyScore": "Smurf score",
  "players.showing":
    "Mostrando {shown} de {total}: afina la búsqueda para acotar.",

  "champions.eyebrow": "La fase de picks y bans",
  "champions.title": "Campeones",
  "champions.subtitle":
    "Todos los campeones del escenario internacional: los más elegidos, mejor winrate y KDA. Ordena la tabla o sube el mínimo de partidas.",
  "champions.minGames": "Mín. partidas",
  "champions.champion": "Campeón",
  "champions.players": "Jugadores",
  "champions.empty": "Todavía no hay campeones con más de {n} partidas.",

  "leaderboards.eyebrow": "Demasiado buenos para su propia liga",
  "leaderboards.title": "Rankings",
  "leaderboards.subtitle":
    "Elige una categoría, filtra por rol y ordena la tabla. Cada récord muestra su mínimo de partidas para que sea honesto.",
  "leaderboards.empty":
    "Todavía no hay datos suficientes para este ranking. El ETL sigue cargando: vuelve a intentarlo en un rato.",
  "leaderboards.category": "Categoría",
  "leaderboards.role": "Rol",
  "leaderboards.showAll": "Mostrar los {n} ▾",
  "leaderboards.showTop": "Mostrar el top 20 ▴",
  "podium.first": "Primero",
  "podium.second": "Segundo",
  "podium.third": "Tercero",

  "records.eyebrow": "El libro de récords histórico",
  "records.title": "Salón de los Récords",
  "records.subtitle":
    "Las marcas más destacadas del League of Legends internacional: lo mejor de lo mejor en los escenarios más grandes del juego.",
  "records.empty":
    "Todavía no hay datos. El ETL está llenando el salón de los récords: vuelve a cargar en un rato.",

  "player.retired": "Retirado",
  "player.legacyScore": "Smurf score",
  "player.rank": "#{rank} de {total}",
  "player.recordsHeld": "Récords en su poder",
  "player.teamHistory": "Historial de equipos",
  "player.trophyCase": "Vitrina de títulos",
  "player.championPool": "Pool de campeones",
  "player.tile.games": "Partidas",
  "player.tile.careerKda": "KDA de carrera",
  "player.tile.winRate": "Winrate",
  "player.tile.intlTitles": "Títulos intl.",
  "player.tile.worldsTitles": "Títulos de Worlds",
  "player.breakdown.titles": "Títulos",
  "player.breakdown.stage": "Escenario",
  "player.breakdown.longevity": "Longevidad",
  "player.breakdown.performance": "Rendimiento",

  "stat.legacy_score.label": "Smurf score",
  "stat.legacy_score.short": "Score",
  "stat.legacy_score.help":
    "Un rating compuesto de grandeza: títulos internacionales (Worlds > MSI > otros), participaciones en Worlds, longevidad y KDA de élite en el escenario grande. Cuanto más alto, más fuerte está smurfeando.",
  "stat.career_kda.label": "Mejor KDA de carrera",
  "stat.career_kda.short": "KDA",
  "stat.career_kda.help":
    "(Asesinatos + Asistencias) / Muertes, sobre los totales de carrera. Mínimo 200 partidas a nivel internacional, 100 en una liga regional.",
  "stat.career_kda_intl.label": "Mejor KDA en internacionales",
  "stat.career_kda_intl.short": "KDA · intl",
  "stat.career_kda_intl.help":
    "KDA de carrera contando solo partidas de Worlds / MSI / First Stand. Mínimo 30 partidas.",
  "stat.intl_titles.label": "Más títulos internacionales",
  "stat.intl_titles.short": "Títulos",
  "stat.intl_titles.help":
    "Worlds + MSI + First Stand ganados estando en el roster con al menos una partida jugada.",
  "stat.worlds_titles.label": "Más títulos de Worlds",
  "stat.worlds_titles.short": "Worlds",
  "stat.worlds_titles.help":
    "Campeonatos del Mundo ganados en el roster campeón.",
  "stat.msi_titles.label": "Más títulos de MSI",
  "stat.msi_titles.short": "MSI",
  "stat.msi_titles.help":
    "Mid-Season Invitational ganados en el roster campeón.",
  "stat.worlds_appearances.label": "Más participaciones en Worlds",
  "stat.worlds_appearances.short": "Particip. Worlds",
  "stat.worlds_appearances.help":
    "Años distintos con al menos una partida del evento principal de Worlds.",
  "stat.games_played.label": "Más partidas jugadas",
  "stat.games_played.short": "Partidas",
  "stat.games_played.help":
    "Total de partidas oficiales jugadas: el récord de longevidad.",
  "stat.career_kills.label": "Más asesinatos de carrera",
  "stat.career_kills.short": "Asesinatos",
  "stat.career_kills.help":
    "Total de asesinatos a lo largo de toda la carrera.",
  "stat.win_rate.label": "Mejor winrate",
  "stat.win_rate.short": "% Vict.",
  "stat.win_rate.help":
    "Victorias / partidas. Mínimo 200 partidas a nivel internacional, 100 en una liga regional.",
  // --- Oracle's Elixir: ligas regionales y economía por timing ---
  "stat.gd15.label": "Mejor diferencia de oro a los 15",
  "stat.gd15.short": "GD@15",
  "stat.gd15.help":
    "Ventaja promedio de oro sobre el rival de línea a los 15 minutos. Se promedia sobre las partidas que traen datos de timing — mínimo 50.",
  "stat.gold15.label": "Más oro a los 15",
  "stat.gold15.short": "Oro@15",
  "stat.gold15.help":
    "Oro promedio acumulado a los 15 minutos. Mismo mínimo de 50 partidas con datos de timing.",
  "stat.cs_per_min.label": "Mejor CS por minuto",
  "stat.cs_per_min.short": "CS/min",
  "stat.cs_per_min.help":
    "CS total dividido por los minutos totales jugados — no es un promedio de los ratios de cada partida. Mínimo 100 partidas.",
  "stat.dpm.label": "Más daño por minuto",
  "stat.dpm.short": "DPM",
  "stat.dpm.help":
    "Daño a campeones dividido por los minutos totales jugados, desde totales de carrera. Mínimo 100 partidas.",
  "stat.pentakills.label": "Más pentakills",
  "stat.pentakills.short": "Pentas",
  "stat.pentakills.help":
    "Pentakills de carrera, contando por igual ligas domésticas e internacionales.",
  "stat.pentakills.coverage":
    "Los pentakills vienen de Oracle's Elixir, que no registra multikills en las partidas que marca como incompletas — por eso las partidas de LPL desde 2022 no se cuentan.",
  // --- Leaderboards: selectores de universo y región ---
  "leaderboards.scope": "Ámbito",
  "leaderboards.universe.intl": "Internacional",
  "leaderboards.universe.regional": "Regional",
  "leaderboards.region": "Región",
  "leaderboards.allRegions": "Todas las regiones",
  "leaderboards.regionalSource": "Datos regionales: Oracle's Elixir.",
  // --- Perfiles de jugadores solo regionales ---
  "player.regionalCareer": "Carrera regional",
  "player.regionalOnly":
    "Solo competencia doméstica — sin apariciones internacionales, así que no tiene Smurf Score.",
  "player.tile.gd15": "GD@15",
  "player.tile.csPerMin": "CS/min",

  // --- Aclaraciones de alcance: tooltips en encabezados + notas por página ---
  "tip.more": "Más información",
  "tip.games":
    "Solo partidas oficiales de competición — nunca soloQ. Totales históricos.",
  "tip.playersGames":
    "Partidas oficiales registradas: eventos internacionales para quienes tienen carrera internacional, ligas domésticas para los jugadores solo regionales. Nunca soloQ.",
  "tip.winRate":
    "Victorias ÷ partidas, solo partidas oficiales de competición, histórico completo.",
  "tip.kda":
    "(Asesinatos + Asistencias) ÷ Muertes sobre totales de carrera — no es un promedio del KDA de cada partida.",
  "tip.champGames":
    "Veces elegido en partidas oficiales — un campeón aparece como máximo una vez por partida. Histórico completo.",
  "tip.champPlayers": "Profesionales distintos que han jugado este campeón.",
  "scopeNote.official":
    "Solo partidas oficiales de competición — histórico completo. Nunca soloQ.",
  "scopeNote.intl":
    "Solo eventos internacionales (Worlds · MSI · First Stand) — partidas oficiales, histórico completo. Nunca soloQ.",
};

export const MESSAGES: Record<Locale, Record<MsgKey, string>> = { en, es };
