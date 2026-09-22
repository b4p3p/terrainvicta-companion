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


def trait_name(lang, data_name):
    t = templates()["traits"].get(data_name) or {}
    return loc(lang, "TITraitTemplate", "displayName", data_name,
               t.get("friendlyName", data_name))


@lru_cache(maxsize=None)
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
