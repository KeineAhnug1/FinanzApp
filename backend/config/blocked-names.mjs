const BLOCKED_NAME_TERMS = Object.freeze([
  // Nationalsozialismus / NS-Bezug
  "adolfhitler",
  "hitler",
  "adolf",
  "führer",
  "fuhrer",
  "ss",
  "waffenss",
  "gestapo",
  "wehrmacht",
  "reich",
  "drittesreich",
  "thirdreich",
  "nazi",
  "nazis",
  "nationalsozialismus",
  "nsdap",
  "holocaust",
  "auschwitz",
  "heilhitler",
  "1488",
  "88",
  "14words",

  // Weitere extremistische Ideologien
  "kkk",
  "ku klux klan",
  "ku-klux-klan",
  "whitepower",
  "whitesupremacy",
  "whitesupremacist",
  "bloodandhonour",
  "combat18",
  "hammerskins",

  // Terrororganisationen
  "isis",
  "isil",
  "daesh",
  "alqaeda",
  "al-qaeda",
  "taliban",
  "boko haram",
  "hamas",
  "hezbollah",

  // Gewaltverherrlichung
  "massacre",
  "schoolshooter",
  "genocide",
  "terrorist",
  "terrorism",

  // Stark beleidigende / Hassbegriffe (Beispiele)
  "nigger",
  "faggot",
  "retard",
  "kike",
  "spic",
  "chink",
  "raghead",

  // Allgemein extremistische Codes
  "18",
  "1312",
  "311",
  "wpww",

  // Sonstige bekannte extremistische Personen
  "hess",
  "rudolfhess",
  "goebbels",
  "himmler",
  "göring",
  "goring",
  "mussolini",
  "binladen",
  "osamabinladen",
  "breivik"
]);

function normalizeNameValue(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_BLOCKED_NAME_TERMS = Object.freeze(
  BLOCKED_NAME_TERMS
    .map((entry) => normalizeNameValue(entry))
    .filter(Boolean)
);

export function detectBlockedRegistrationName({ username, firstName, lastName }) {
  const combinedCandidate = [
    username,
    firstName,
    lastName
  ].join(" ");
  const normalizedCandidate = normalizeNameValue(combinedCandidate);
  if (!normalizedCandidate) return null;

  for (const blockedTerm of NORMALIZED_BLOCKED_NAME_TERMS) {
    if (normalizedCandidate.includes(blockedTerm)) {
      return blockedTerm;
    }
  }

  return null;
}

export { BLOCKED_NAME_TERMS };
