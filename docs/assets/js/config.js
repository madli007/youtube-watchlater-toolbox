(function registerConfig(root) {
  "use strict";

  const STORAGE_KEY = "watchlater-triage-decisions-v1";
  const HISTORY_STORAGE_KEY = "watchlater-triage-history-v1";
  const USER_RULES_STORAGE_KEY = "watchlater-triage-user-rules-v1";
  const CHANNEL_RULES_STORAGE_KEY = "watchlater-triage-channel-rules-v1";
  const SAVED_VIEWS_STORAGE_KEY = "watchlater-triage-saved-views-v1";
  const DATASET_BASELINE_STORAGE_KEY = "watchlater-triage-dataset-baseline-v1";
  const TIME_BUDGET_STORAGE_KEY = "watchlater-triage-time-budget-hours-v1";
  const PREVIEW_PROGRESS_STORAGE_KEY = "watchlater-triage-preview-progress-v1";
  const PAGE_SIZE = 220;
  const BULK_CONFIRM_THRESHOLD = 100;
  const MAX_HISTORY_ENTRIES = 20;
  const GROUPING_STOP_WORDS = new Set([
    "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "vs", "with",
    "del", "de", "der", "die", "das", "el", "la", "le", "les", "un", "una", "und", "y",
    "official", "video", "audio", "hd", "uhd", "full",
  ]);
  const RULES = {
    reactions: ["reaction", "reacts", "first time watching", "group reaction", "movie reaction", "episode reaction", "watching for the first time", "after show reacts", "#strugglenation", "blind wave", "reel rejects", "the normies", "holden & jen", "kat & sonny", "the 354 squad", "sean tanktop", "mary cherry", "just stef", "alyska"],
    marvel: ["marvel", "mcu", "daredevil", "punisher", "spider-noir", "spider noir", "spider-man", "spiderman", "captain america", "black panther", "ant-man", "wakanda", "avengers", "loki", "thor", "wanda", "deadpool", "x-men", "fantastic four", "moon knight", "hawkeye", "she-hulk", "doctor strange", "iron man", "secret invasion"],
    starWars: ["star wars", "clone wars", "ahsoka", "maul", "andor", "kenobi", "jedi", "sith", "mandalorian", "bad batch", "rebels", "tales of the jedi"],
    stargate: ["stargate", "sg-1", "sg1", "atlantis", "stargate atlantis"],
    gameOfThrones: ["game of thrones", "house of the dragon", "hotd", "dunk and egg", "a knight of the seven kingdoms", "asoiaf", "alt shift x"],
    dragonBall: ["dragon ball", "dbz", "dbs", "goku", "vegeta", "frieza"],
    chess: ["chess", "gothamchess", "anna cramling", "gmhikaru", "hikaru", "magnus", "magnus carlsen", "eric rosen"],
    gaming: ["gaming", "gameplay", "let's play", "forza", "rocket league", "lethamyr", "assassin's creed", "metro", "geoguessr", "minecraft", "gta", "league of legends", "valorant", "cs2", "counter-strike", "xqc", "squid game"],
    vfx: ["vfx", "cgi", "corridor crew", "vfx artists", "artists react", "bad & great", "bad and great"],
    politics: ["trump", "obama", "biden", "ukraine", "russia", "putin", "maga", "democrat", "republican", "election", "politics", "political", "nato", "congress", "parliament", "daily show", "last week tonight", "john oliver", "legal eagle", "destiny", "vlad vexler", "brian tyler cohen"],
    moviesTv: ["movie", "film", "season", "episode", "series", "netflix", "hbo", "max", "trailer", "recap", "finale", "pilot", "lost", "one piece", "breaking bad", "rush hour", "men in black"],
    music: ["music", "song", "sing", "sings", "cover", "vocal", "guitar", "piano", "band", "live performance", "lyrics", "eurovision"],
    travel: ["travel", "truck vlog", "slovenia", "romania", "austria", "honest guide", "europe hits different", "trucking vlogs"],
    dev: ["javascript", "typescript", "programming", "developer", "coding", "software", "openai", "google developers", "unreal engine", "cursor", "claude", "github", "database", "api", "frontend", "backend"],
    asmr: ["asmr"],
  };

  Object.values(RULES).forEach(Object.freeze);
  Object.freeze(RULES);

  const app = root.WatchLaterApp ||= {};
  app.config = Object.freeze({
    STORAGE_KEY,
    HISTORY_STORAGE_KEY,
    USER_RULES_STORAGE_KEY,
    CHANNEL_RULES_STORAGE_KEY,
    SAVED_VIEWS_STORAGE_KEY,
    DATASET_BASELINE_STORAGE_KEY,
    TIME_BUDGET_STORAGE_KEY,
    PREVIEW_PROGRESS_STORAGE_KEY,
    PAGE_SIZE,
    BULK_CONFIRM_THRESHOLD,
    MAX_HISTORY_ENTRIES,
    GROUPING_STOP_WORDS,
    RULES,
  });
})(globalThis);
