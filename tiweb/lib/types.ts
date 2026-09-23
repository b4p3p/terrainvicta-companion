// Forma del payload servito da tiserver. Rispecchia ticore/model.py.

export type Attr =
  | "Persuasion" | "Investigation" | "Espionage" | "Command"
  | "Administration" | "Science" | "Security";

export const ATTRS: Attr[] = [
  "Persuasion", "Investigation", "Espionage", "Command",
  "Administration", "Science", "Security",
];

export interface Org {
  id: number;
  name: string;
  type: string | null;
  tier: number | null;
  cost: { money: number; influence: number; ops: number; boost: number };
  income: {
    money: number; influence: number; ops: number;
    research: number; boost: number; missionControl: number;
  };
  attributes: Partial<Record<Attr, number>>;
  projectSlots: number;
  missionsGranted: string[];
  requiresNationality: boolean;
  requiredTraits: string[];
  prohibitedTraits: string[];
  homeNation: string | null;
  eligible?: string[];
  blocked?: { name: string; why: { kind: string; value: unknown }[] }[];
  affordable?: boolean;
  paybackMonths?: number | null;
}

export interface Councilor {
  id: number;
  name: string;
  type: string;
  typeName: string;
  nationality: string | null;
  location: string | null;
  xp: number;
  base: Record<Attr, number>;
  attributes: Record<Attr, number>;
  traits: Trait[];
  orgs: Org[];
  missions: string[];
  apparentLoyalty: number | null;
  loyalty?: number | null;
  priorMission: string | null;
  income: Income;
  /* solo sui candidati: differenze rispetto al consiglio attuale */
  covers?: { id: string; name: string; icon: string | null; attribute: Attr | null }[];
  gain?: Partial<Record<Attr, number>>;
  fixesWeak?: string[];
  /* consiglieri forti (euristica STRONG_AT) su quell'attributo, prima e dopo */
  depth?: Partial<Record<Attr, { now: number; after: number }>>;
  /* missioni non standard del candidato; `new` = oggi nessuno la sa fare */
  missionList?: { id: string; name: string; icon: string | null;
    attribute: Attr | null; new: boolean }[];
}

/** Effetto dichiarato dal template del tratto. Codici, tradotti dall'interfaccia. */
export type TraitEffect =
  | { kind: "stat"; stat: Attr; value: number; conditional: boolean }
  | { kind: "statFixed"; stat: string; value: number; conditional: boolean }
  | { kind: "loyalty" | "apparentLoyalty"; value: number; conditional: boolean }
  | { kind: "transparent" }
  | { kind: "income"; resource: "money" | "influence" | "research" | "ops" | "boost";
      value: number }
  | { kind: "xp"; value: number }
  | { kind: "mission" | "restricted"; id: string; name: string; icon: string | null }
  | { kind: "rule"; rule: string; value: number | null };

export interface Trait {
  id: string;
  name: string;
  effects?: TraitEffect[];
}

export interface Income {
  money: number;
  influence: number;
  research: number;
  ops: number;
  boost: number;
  /* true quando e' ricostruito dai tratti perche' il salvataggio non lo espone */
  fromTraits: boolean;
}

export interface Coverage {
  attribute: Attr;
  short: string;
  best: { name: string; value: number } | null;
  total: number;
  max: number;
  weak: boolean;
}

export interface MissionInfo {
  id: string;
  name: string;
  /* nome dell'icona del gioco, servita da /api/icons/mission/<icon>.png */
  icon: string | null;
  attribute: Attr | null;
  attributeShort: string | null;
  cost: {
    resource: string; value: number | null;
    resourceName: string; icon: string | null;
  } | null;
  covered: boolean;
  holders: string[];
  best: { name: string; value: number } | null;
  providers?: {
    councilorTypes: { id: string; name: string }[];
    orgCount: number;
  };
}

export interface Nation {
  name: string;
  eu: boolean;
  gdp: number;
  pop: number;
  gdpPc: number;
  research: number;
  histResearch: number[];
  resTrend: number;
  ip: number;
  education: number;
  democracy: number;
  cohesion: number;
  unrest: number;
  inequality: number;
  support: number;
  difficulty: number;
  spaceFunding: number;
  space: boolean;
  nukes: number;
  miltech: number;
  cp: number;
  myCP: number;
  freeCP: number;
  takenCP: number;
  owners: string[];
}

export interface Project {
  id: string;
  name: string;
  cost: number;
  repeatable: boolean;
  grants: { resource: string; value: number }[];
  effects: string[];
  category: string | null;
  active: boolean;
  slot: number | null;
  accumulated: number;
  monthsLeft: number | null;
}

export interface Snapshot {
  /* colori che il gioco assegna alla fazione (TIFactionTemplate) */
  factionColors: { accent: string | null; background: string | null };
  faction: string;
  date: string;
  dateKey: string;
  difficulty: string | null;
  save: string;
  mtime: number;
  lang: string;
  resources: Record<string, number>;
  flows: {
    year: number; month: number;
    byCategory: Record<string, Record<string, number>>;
    /* etichette delle categorie; `unresolved` = il save scrive un hash */
    categories: {
      id: string;
      name: string | null;
      icon?: string | null;
      kind: "mission" | "label" | "unresolved";
    }[];
    net: Record<string, number>;
    /* nome tradotto e icona di ogni risorsa che compare nei flussi */
    resources: Record<string, { id: string; name: string; icon: string | null }>;
  };
  controlPoints: { byNation: Record<string, number>; mine: number; total: number };
  nations: Nation[];
  council: {
    team: Councilor[];
    coverage: Coverage[];
    missions: { covered: MissionInfo[]; missing: MissionInfo[] };
    size: number;
  };
  recruits: Councilor[];
  orgMarket: Org[];
  projects: { rate: number; items: Project[] };
  alienSites: { region: string; since: string }[];
  cpCapOverage: boolean;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  tab: string | null;
  [k: string]: unknown;
}

export interface MissionFactor {
  side: string;
  kind: string;
  field?: string;
  sign?: number;
  label: string;
}

export interface MissionTarget {
  name: string;
  eu: boolean;
  myCP: number; freeCP: number; takenCP: number; cp: number;
  owners: string[];
  difficulty: number;
  gdp: number; pop: number; research: number;
  unrest: number; cohesion: number; democracy: number; support: number;
  score: number;
  factors: { label: string; field: string; value: number; sign: number; contribution: number }[];
}

export interface MissionPlan {
  mission: string;
  missionName: string;
  attribute: Attr | null;
  attributeShort: string | null;
  councilorValue: number | null;
  councilor: string | null;
  candidates?: string[];
  factors: { readable: MissionFactor[]; opaque: { side: string; label: string }[] };
  targets: MissionTarget[] | null;
  note?: string;
}

export interface CatalogueEntry {
  id: string;
  name: string;
  attribute: Attr | null;
  attributeShort: string | null;
  cost: {
    resource: string; value: number | null;
    resourceName: string; icon: string | null;
  } | null;
  target: string;
  supportsTargeting: boolean;
  holders: string[];
  best: { name: string; value: number } | null;
  xp: number;
}

export interface HistoryPoint {
  dateKey: string;
  date: string;
  resources: Record<string, number>;
  net: Record<string, number>;
  cp: number;
  council: number;
  research: number;
}

export interface Goal {
  id: number;
  title: string;
  kind: string | null;
  target: string | null;
  amount: number | null;
  due: string | null;
  done: number;
  current: number | null;
  total: number | null;
  late: boolean;
}

export interface Note {
  id: number;
  subject: string;
  body: string;
  created: number;
  updated: number;
}

/** Serie storiche per nazione (/api/nations/trends): chiavi come in `Nation`. */
export type TrendKey = "gdp" | "pop" | "research" | "ip" | "education" | "democracy"
  | "cohesion" | "unrest" | "inequality" | "miltech" | "nukes" | "support";

export interface NationTrends {
  points: number;
  nations: Record<string, Partial<Record<TrendKey, number[]>>>;
}
