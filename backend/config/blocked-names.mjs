// @ts-check

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
  "Wehrmacht",
  "reich",
  "drittesreich",
  "thirdreich",
  "drittes reich",
  "nazi",
  "nazis",
  "naziboy",
  "nazigirl",
  "nationalsozialismus",
  "nationalsozialist",
  "nsdap",
  "holocaust",
  "auschwitz",
  "heilhitler",
  "sieg heil",
  "siegheil",
  "heil",
  "1488",
  "88",
  "14words",
  "14 words",

  // Weitere extremistische Ideologien
  "kkk",
  "ku klux klan",
  "ku-klux-klan",
  "whitepower",
  "white power",
  "whitesupremacy",
  "white supremacy",
  "whitesupremacist",
  "white nationalist",
  "whitenationalist",
  "bloodandhonour",
  "blood and honour",
  "combat18",
  "hammerskins",
  "neonazi",
  "neo nazi",
  "neo-nazi",

  // Terrororganisationen
  "isis",
  "isil",
  "daesh",
  "alqaeda",
  "al-qaeda",
  "al qaeda",
  "taliban",
  "boko haram",
  "bokoharam",
  "hamas",
  "hezbollah",
  "islamicstate",
  "islamic state",
  "jabhatalnusra",
  "jabhat al-nusra",

  // Gewaltverherrlichung
  "massacre",
  "massacreboy",
  "schoolshooter",
  "school shooter",
  "massshooting",
  "mass shooting",
  "genocide",
  "genozid",
  "terrorist",
  "terrorism",
  "terrorattack",
  "jihad",

  // Stark beleidigende Hassbegriffe / Slurs
  "nigger",
  "nigga",
  "neger",
  "faggot",
  "retard",
  "retarded",
  "kike",
  "spic",
  "chink",
  "gook",
  "raghead",
  "sandnigger",
  "towelhead",
  "wetback",
  "beaner",
  "wop",
  "heeb",
  "hymie",
  "jap",
  "coon",
  "sambo",
  "drecksjude",
  "judenschwein",
  "kanake",
  "zigeuner",

  // Allgemein extremistische Codes
  "18",
  "1312",
  "311",
  "88",
  "161",
  "1161",
  "wpww",

  // Sonstige bekannte extremistische / Gewalt-Personen
  "hess",
  "rudolfhess",
  "goebbels",
  "josephgoebbels",
  "himmler",
  "heinrichhimmler",
  "göring",
  "goring",
  "eichmann",
  "mengele",
  "josefmengele",
  "mussolini",
  "saddam",
  "saddamhussein",
  "binladen",
  "osamabinladen",
  "osama",
  "breivik",
  "andersbreivik",
  "dylanroof",
  "dylannroof",
  "elliotrodger",
  "robertbowers",
  "brentontarrant",

  // --- Nationalsozialismus / NS-Bezug (Erweiterung)
  "hitlerjugend",
  "hitleryouth",
  "sturmbann",
  "sturmbannführer",
  "aryan",
  "aryannation",
  "aryan nation",
  "aryanbrotherhood",
  "aryan brotherhood",
  "volksverräter",
  "volkstod",
  "blutundboden",
  "blood and soil",
  "lebensraum",
  "reichskriegsflagge",
  "reichsadler",
  "juden",
  "judensau",
  "untermensch",
  "übermensch",
  "uebermensch",
  "endsieg",
  "endloesung",
  "endlösung",
  "final solution",
  "kristallnacht",
  "novemberpogrom",
  "vernichtungslager",

  // --- Weitere rechtsextreme Codes
  "28",          // Blood & Honour Code
  "444",
  "764",
  "rahowa",      // racial holy war
  "zog",         // zionist occupied government
  "hffh",        // honour & fatherland codes
  "14/88",
  "8814",
  "14881488",

  // --- Internationale extremistische Bewegungen
  "proudboys",
  "proud boys",
  "atomwaffen",
  "atomwaffendivision",
  "atomwaffen division",
  "thebase",
  "the base",
  "goldendawn",
  "golden dawn",
  "identitäre",
  "identitarian",
  "boogaloo",
  "boogaloo bois",
  "patriotfront",
  "patriot front",
  "nationalaction",
  "generationidentity",
  "generation identity",
  "o9a",             // Order of Nine Angles
  "orderofnineangles",

  // --- Islamistischer Extremismus (Erweiterung)
  "sharia4",
  "jihadi",
  "jihadist",
  "martyrdom",
  "kalifat",
  "caliphate",
  "hizbuttahrir",

  // --- Gewaltverherrlichung (Erweiterung)
  "killall",
  "kill all",
  "killthem",
  "racewar",
  "race war",
  "ethniccleansing",
  "ethnic cleansing",
  "lynching",
  "shootup",
  "bombthem",
  "beheading",

  // --- Selbstmord / Amok (präventiv)
  "suicidebomber",
  "suicide bomber",
  "martyr",
  "amoklauf",
  "amok",

  // --- Sexuelle Ausbeutung / Kindesmissbrauch
  "pedo",
  "pedophile",
  "pädophil",
  "paedo",
  "childabuse",
  "childporn",
  "nambla",

  // --- Stark diskriminierende Begriffe
  "cunt",
  "slut",
  "whore",
  "bastard",
  "mongoloid",
  "gypsy",

  // --- Personen aus Terror / Extremismus
  "albaghdadi",
  "baghdadi",
  "awlakii",
  "zarqawi",
  "mohammedatta",
  "tarrant",
  "brenton",
  "mcveigh",
  "timothymcveigh",
  "Timgioh",
  "Sakultendo",
  "MaxPro",
  "ReneRedo",
  "epstein",
  "jeffreyepstein",
  "kirk",

  // --- System-/Infrastruktur-Reservierungen
  "admin",
  "administrator",
  "root",
  "superuser",
  "system",
  "sysadmin",
  "moderator",
  "support",
  "helpdesk",
  "staff",
  "official",
  "finanzapp",
  "service",
  "noreply",
  "no-reply",
  "postmaster",
  "webmaster",
  "security",
  "abuse",
  "null",
  "undefined",
  "anonymous",
  "anon"
]);

/** @param {unknown} value */
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

const NORMALIZED_BLOCKED_MESSAGE_TERMS = Object.freeze(
  BLOCKED_NAME_TERMS
    .map((entry) => normalizeNameValue(entry))
    .filter((entry) => /[a-z]/.test(entry))
);

/**
 * @param {{ username: unknown; firstName: unknown; lastName: unknown }} opts
 * @returns {string | null}
 */
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

/**
 * @param {unknown} message
 * @returns {string | null}
 */
export function detectBlockedMessageTerm(message) {
  const normalizedMessage = normalizeNameValue(message);
  if (!normalizedMessage) return null;

  for (const blockedTerm of NORMALIZED_BLOCKED_MESSAGE_TERMS) {
    if (normalizedMessage.includes(blockedTerm)) {
      return blockedTerm;
    }
  }

  return null;
}

export { BLOCKED_NAME_TERMS };
