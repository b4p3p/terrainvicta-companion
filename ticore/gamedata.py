"""Template del gioco e localizzazione.

Il gioco spedisce i propri template in JSON e le traduzioni in file `.ita`,
`.fr`, `.deu`... con righe `TIXxxTemplate.displayName.DataName=Testo`.
Usiamo quelle: 14 lingue gratis e terminologia identica a quella in partita.
"""

import json
import os
from functools import lru_cache

from . import paths

# lingue del gioco -> etichetta leggibile (dataName di TILocalizationTemplate)
LANGUAGES = {
    "en": "English", "ita": "Italiano", "fr": "Français", "deu": "Deutsch",
    "esp": "Español", "por": "Português", "pol": "Polski", "rus": "Русский",
    "ukr": "Українська", "cze": "Čeština", "chs": "简体中文", "cht": "繁體中文",
    "jpn": "日本語", "kor": "한국어",
}

# template JSON che ci interessano -> indicizzati per dataName
_TEMPLATE_FILES = {
    "orgs": "TIOrgTemplate.json",
    "projects": "TIProjectTemplate.json",
    "missions": "TIMissionTemplate.json",
    "councilorTypes": "TICouncilorTypeTemplate.json",
    "traits": "TITraitTemplate.json",
    "effects": "TIEffectTemplate.json",
    "factions": "TIFactionTemplate.json",
}


@lru_cache(maxsize=1)
def templates():
    d = paths.template_dir()
    out = {k: {} for k in _TEMPLATE_FILES}
    if not d:
        return out
    for key, fn in _TEMPLATE_FILES.items():
        p = os.path.join(d, fn)
        if not os.path.isfile(p):
            continue
        try:
            data = json.load(open(p, encoding="utf-8-sig"))
        except Exception:
            continue
        out[key] = {o["dataName"]: o for o in data
                    if isinstance(o, dict) and o.get("dataName")}
    return out


@lru_cache(maxsize=None)
def strings(lang):
    """{'TIMissionTemplate.displayName.GainInfluence': 'Controlla nazione', ...}"""
    d = paths.localization_dir()
    out = {}
    if not d:
        return out
    ld = os.path.join(d, lang)
    if not os.path.isdir(ld):
        return out
    for fn in os.listdir(ld):
        p = os.path.join(ld, fn)
        if not os.path.isfile(p):
            continue
        try:
            for line in open(p, encoding="utf-8", errors="ignore"):
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.rstrip("\n")
        except Exception:
            continue
    return out


@lru_cache(maxsize=1)
def available_languages():
    d = paths.localization_dir()
    if not d:
        return ["en"]
    present = [x for x in os.listdir(d) if os.path.isdir(os.path.join(d, x))]
    return [x for x in LANGUAGES if x in present] or ["en"]


def loc(lang, template, field, name, fallback=None):
    """Traduzione di un dataName; ricade sull'inglese e poi sul dataName."""
    key = "%s.%s.%s" % (template, field, name)
    s = strings(lang).get(key)
    if s:
        return s
    s = strings("en").get(key)
    if s:
        return s
    return fallback if fallback is not None else name


def mission_name(lang, data_name):
    t = templates()["missions"].get(data_name) or {}
    return loc(lang, "TIMissionTemplate", "displayName", data_name,
               t.get("friendlyName", data_name))


def mission_attribute(data_name):
    """Attributo su cui tira la missione, letto dai modificatori di risoluzione."""
    t = templates()["missions"].get(data_name) or {}
    rm = t.get("resolutionMethod") or {}
    for m in (rm.get("attackingModifiers") or []):
        if m.get("$type", "").endswith("CouncilorAttackStat"):
            return m.get("attackerAttribute")
    return None


def mission_cost(data_name):
    """(risorsa, valore) — valore None se scala col bersaglio."""
    t = templates()["missions"].get(data_name) or {}
    c = (t.get("cost") or {})
    if not c:
        return None, None
    return c.get("resourceType"), c.get("value")


@lru_cache(maxsize=None)
def mission_icon(data_name):
    """Nome dell'icona della missione, senza cartella ne' estensione.

    Nei template e' `councilor_missions/ICO_assassinate`: una `Resources.Load`
    di Unity, non un file su disco. Le immagini stanno nel bundle
    `councilor_missions`, dove ogni voce esiste in variante `_on` e `_off`.
    """
    t = templates()["missions"].get(data_name) or {}
    p = t.get("missionIconImagePath") or ""
    return p.rsplit("/", 1)[-1] or None


@lru_cache(maxsize=None)
def faction_colors(data_name):
    """Colore della fazione come lo definisce il gioco.

    `color` e' RGB in virgola mobile 0-1, `backgroundColor` e' gia' esadecimale.
    Servono all'interfaccia per tingersi della fazione del giocatore invece di
    usare un accento inventato.
    """
    t = templates()["factions"].get(data_name) or {}
    c = t.get("color") or {}
    accent = None
    if c:
        accent = "#%02x%02x%02x" % tuple(
            max(0, min(255, round((c.get(k) or 0) * 255))) for k in "rgb")
    return {"accent": accent, "background": t.get("backgroundColor")}


# risorsa -> icona nel bundle icons_2d, come la disegna il gioco
RESOURCE_ICONS = {
    "Money": "ICO_currency",
    "Influence": "ICO_influence",
    "Operations": "ICO_ops",
    "Research": "ICO_research",
    "Projects": "ICO_projects",
    "Boost": "ICO_boost",
    "MissionControl": "ICO_mission_control",
}


def resource_name(lang, key):
    """Nome tradotto di una risorsa, dalla localizzazione ufficiale.

    Le righe sono `UI.Global.Money=Denaro`. Mai tradurre a mano: la stringa
    deve essere quella che il giocatore legge in partita.
    """
    return loc(lang, "UI", "Global", key, key)


def resource_view(lang, key):
    return {"id": key, "name": resource_name(lang, key),
            "icon": RESOURCE_ICONS.get(key)}


# Priorita' nazionali: campo `<chiave>Setting` di TIPriorityPresetTemplate ->
# (voce di PriorityType, icona in icons_2d). Nell'ordine del gioco.
#
# I nomi dei campi non dicono tutto: `spaceProgram` sono i Finanziamenti,
# `boost` la Capacita' di lancio, `initNuclearWeapons` lo sviluppo della bomba
# e `nuclearProgram` la costruzione delle testate. Verificato sull'IL di
# `TIPriorityPresetTemplate.SetAllPresets`, che assegna ogni campo all'indice
# `PriorityType - 1`.
PRIORITIES = {
    "economy": ("Economy", "ICO_economy_priority"),
    "welfare": ("Welfare", "ICO_welfare_priority"),
    "environment": ("Environment", "ICO_environment_priority"),
    "knowledge": ("Knowledge", "ICO_knowledge_priority"),
    "government": ("Government", "ICO_government_priority"),
    "unity": ("Unity", "ICO_unity_priority"),
    "oppression": ("Oppression", "ICO_oppression_priority"),
    "spaceProgram": ("Funding", "ICO_funding_priority"),
    "spoils": ("Spoils", "ICO_spoils_priority"),
    "initSpaceProgram": ("Civilian_InitiateSpaceflightProgram",
                         "ICO_spaceflightProgram_priority"),
    "boost": ("LaunchFacilities", "ICO_launchFacilities_Priority"),
    "missionControl": ("MissionControl", "ICO_missionControl_priority"),
    "foundMilitary": ("Military_FoundMilitary", "ICO_found_military_priority"),
    "military": ("Military", "ICO_military_priority"),
    "army": ("Military_BuildArmy", "ICO_buildArmy_priority"),
    "navy": ("Military_BuildNavy", "ICO_buildNavy_priority"),
    "initNuclearWeapons": ("Military_InitiateNuclearProgram",
                           "ICO_develop_atomic_bomb_priority"),
    "nuclearProgram": ("Military_BuildNuclearWeapons",
                       "ICO_buildNuclearWeapons_priority"),
    "spaceDefense": ("Military_BuildSpaceDefenses",
                     "ICO_buildSpaceDefenses_priority"),
    "sto": ("Military_BuildSTOSquadron", "ICO_buildSTOSquadron_priority"),
}


def priority_name(lang, key):
    """Nome in partita di una priorita', da `UI.Nation.Priority_<tipo>`."""
    kind = PRIORITIES.get(key, (key, None))[0]
    return loc(lang, "UI", "Nation", "Priority_" + kind, key)


def priority_view(lang, key):
    kind, icon = PRIORITIES.get(key, (key, None))
    return {"id": key, "type": kind, "name": priority_name(lang, key),
            "icon": icon}


def trait_name(lang, data_name):
    t = templates()["traits"].get(data_name) or {}
    return loc(lang, "TITraitTemplate", "displayName", data_name,
               t.get("friendlyName", data_name))


@lru_cache(maxsize=None)
def trait_description(lang, data_name):
    """Descrizione del tratto come la mostra il gioco. None se manca."""
    d = loc(lang, "TITraitTemplate", "description", data_name, "")
    return d or None


def trait_income(data_name):
    """Reddito mensile concesso da un tratto.

    I candidati non hanno ancora i campi `incomeX_month` popolati nel
    salvataggio: il loro reddito va ricostruito dai tratti, che sono la sua
    unica origine (le org dei candidati sono sempre zero).
    """
    t = templates()["traits"].get(data_name) or {}
    return {
        "money": t.get("incomeMoney") or 0,
        "influence": t.get("incomeInfluence") or 0,
        "research": t.get("incomeResearch") or 0,
        "ops": t.get("incomeOps") or 0,
        "boost": t.get("incomeBoost") or 0,
    }


_TRAIT_INCOME = (("incomeMoney", "money"), ("incomeInfluence", "influence"),
                 ("incomeResearch", "research"), ("incomeOps", "ops"),
                 ("incomeBoost", "boost"))


def _num(s):
    try:
        f = float(s)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else f


def trait_effects(lang, data_name):
    """Cosa fa un tratto, letto dal suo template: codici, non frasi.

    L'interfaccia li traduce. Restano fuori i campi di cui non abbiamo
    verificato il significato (bonus di rilevamento, di tecnologia, di
    priorita'): meglio un effetto in meno che uno descritto male.

    Gli effetti sugli attributi sono quelli dichiarati dal tratto. Il
    salvataggio non distingue il valore base da quello modificato, quindi non
    vanno sommati a quanto mostrato: sono il perche' di un numero, non un'aggiunta.
    """
    t = templates()["traits"].get(data_name) or {}
    out = []
    for m in t.get("statMods") or []:
        stat, op = m.get("stat"), m.get("operation")
        if not stat:
            continue
        cond = bool(m.get("condition"))
        if op == "SetToAnotherAttribute":
            if stat == "ApparentLoyalty" and m.get("strValue") == "Loyalty":
                out.append({"kind": "transparent"})
            continue
        v = _num(m.get("strValue"))
        if v is None:
            continue
        if op == "SetToFixedValue":
            out.append({"kind": "statFixed", "stat": stat, "value": v,
                        "conditional": cond})
        elif op == "Additive":
            kind = {"Loyalty": "loyalty",
                    "ApparentLoyalty": "apparentLoyalty"}.get(stat, "stat")
            e = {"kind": kind, "value": v, "conditional": cond}
            if kind == "stat":
                e["stat"] = stat
            out.append(e)
    for field, res in _TRAIT_INCOME:
        if t.get(field):
            out.append({"kind": "income", "resource": res, "value": t[field]})
    if t.get("XPModifier"):
        out.append({"kind": "xp", "value": t["XPModifier"]})
    for m in t.get("missionsGrantedNames") or []:
        out.append({"kind": "mission", "id": m, "name": mission_name(lang, m),
                    "icon": mission_icon(m)})
    for m in t.get("restrictedMissionNames") or []:
        out.append({"kind": "restricted", "id": m, "name": mission_name(lang, m),
                    "icon": mission_icon(m)})
    if t.get("specialTraitRule"):
        out.append({"kind": "rule", "rule": t["specialTraitRule"],
                    "value": t.get("specialTraitRuleValue")})
    return out


def councilor_type_name(lang, data_name):
    t = templates()["councilorTypes"].get(data_name) or {}
    return loc(lang, "TICouncilorTypeTemplate", "displayName", data_name,
               t.get("friendlyName", data_name))


def project_name(lang, data_name):
    t = templates()["projects"].get(data_name) or {}
    return loc(lang, "TIProjectTemplate", "displayName", data_name,
               t.get("friendlyName", data_name))


def base_missions():
    """Missioni che ha ogni consigliere: la categoria 'Standard' dell'interfaccia.

    Nei template sono marcate `baseMission` — Contact, Deorbit, GoToGround,
    Orbit, SetNationalPolicy, Transfer.
    """
    return {n for n, t in templates()["missions"].items() if t.get("baseMission")}


def player_missions():
    """Missioni che un consiglio umano puo' arrivare ad avere.

    Esclude il tipo `Alien` (Rapimenti, Xenoforma, Proclama i maestri...) e le
    missioni base, che non possono mancare a nessuno.
    """
    tpl = templates()
    usable = set()
    for name, t in tpl["councilorTypes"].items():
        if name == "Alien":
            continue
        usable.update(t.get("missionNames") or [])
    for o in obtainable_orgs().values():
        usable.update(o.get("missionsGrantedNames") or [])
    return usable - base_missions()


def obtainable_orgs():
    """Org che possono davvero finire nelle tue mani.

    Le org uniche di trama o aliene concedono missioni come 'Lancia il Bifrost'
    o 'Proclama i maestri': contarle fra le missioni 'mancanti' e' rumore.
    """
    return {n: o for n, o in templates()["orgs"].items()
            if o.get("allowedOnMarket") and not o.get("restricted")}
