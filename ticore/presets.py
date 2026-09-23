"""Preset di priorita' nazionali: lettura, analisi e installazione.

I preset personalizzati del giocatore vivono in `customPresets`, un campo
**dentro il salvataggio**: non c'e' modo, nel gioco, di portarli in una partita
nuova. I template invece si caricano a ogni avvio.

Il sistema dei mod risolverebbe il problema, ma in Terra Invicta **attivare i
mod disattiva gli achievement** — basta la casella nel menu, senza nemmeno un
mod acceso, e il salvataggio lo registra in `playedWithMods`. Qui quindi si
scrive direttamente in `TIPriorityPresetTemplate.json`, aggiungendo voci con un
`dataName` nuovo: il gioco non se ne accorge come mod e `playedWithMods` resta
falso.

Il prezzo e' che un aggiornamento di Steam, o "verifica integrita' file",
riscrive i template e cancella l'aggiunta. `status()` se ne accorge e
`install()` e' idempotente, cosi' basta rilanciarla.

Questi preset non concedono nulla che non si possa gia' impostare a mano in
partita: sono una scorciatoia, non un vantaggio.
"""

import json
import os
import shutil
import time

from . import gamedata, paths

TEMPLATE = "TIPriorityPresetTemplate.json"
PREFIX = "TIC_"                 # marca le voci nostre: mai toccare le altre
_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SOURCE = os.path.join(_REPO, "mods", "TerraInvictaCompanionPresets", TEMPLATE)

# quali priorita' contano come spesa militare, per il riepilogo
_MILITARY = ("military", "foundMilitary", "army", "navy",
             "nuclearProgram", "initNuclearWeapons", "spaceDefense", "sto")


def template_file():
    d = paths.template_dir()
    p = os.path.join(d, TEMPLATE) if d else None
    return p if p and os.path.isfile(p) else None


def _read(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def weights(preset):
    """{priorita': peso} per le sole voci accese.

    I campi si chiamano `<priorita'>Setting` e valgono 1-3. **Un campo assente
    spegne la priorita'**, ed e' cosi' che si alza la quota delle altre: il
    bilancio della nazione si divide per peso fra le voci accese.
    """
    return {k[:-len("Setting")]: v for k, v in preset.items()
            if k.endswith("Setting") and isinstance(v, (int, float)) and v}


def analyse(preset):
    w = weights(preset)
    total = sum(w.values())
    if not total:
        return {"weights": w, "total": 0, "research": 0.0, "military": 0.0, "count": 0}
    mil = sum(v for k, v in w.items() if k in _MILITARY)
    return {
        "weights": w,
        "total": total,
        "count": len(w),
        "research": w.get("knowledge", 0) / total,
        "military": mil / total,
    }


def custom():
    """I preset che il companion sa installare."""
    try:
        return _read(_SOURCE)
    except (OSError, ValueError):
        return []


def view(preset, lang="ita", installed=False):
    name = gamedata.loc(lang, "TIPriorityPresetTemplate", "displayName",
                        preset["dataName"],
                        preset.get("friendlyName") or preset["dataName"])
    return dict(analyse(preset),
                id=preset["dataName"],
                name=name,
                faction=preset.get("factionName"),
                mine=preset["dataName"].startswith(PREFIX),
                installed=installed)


def status(lang="ita"):
    """Preset del gioco piu' i nostri, con lo stato di installazione."""
    path = template_file()
    if not path:
        return {"ok": False, "error": "Template del gioco non trovato.",
                "path": None, "presets": [], "pending": []}
    try:
        data = _read(path)
    except (OSError, ValueError) as e:
        return {"ok": False, "error": str(e), "path": path,
                "presets": [], "pending": []}

    have = {o.get("dataName") for o in data}
    # solo i preset del giocatore: le opzioni dell'AI nazionale non si scelgono.
    # I nostri restano fuori: hanno gia' la loro sezione, e una volta installati
    # comparirebbero due volte.
    listed = [view(o, lang, installed=True) for o in data
              if not o.get("nationalAIOption")
              and not str(o.get("dataName", "")).startswith(PREFIX)]
    pending = [view(o, lang, installed=o["dataName"] in have) for o in custom()]
    return {
        "ok": True,
        "error": None,
        "path": path,
        "writable": os.access(path, os.W_OK),
        "backup": os.path.isfile(path + ".ti-companion.bak"),
        "installed": sum(1 for p in pending if p["installed"]),
        "presets": listed,
        "pending": pending,
    }


def install(lang="ita"):
    """Aggiunge i nostri preset al template del gioco. Idempotente.

    Non modifica nessuna voce esistente: sostituisce solo quelle col nostro
    prefisso e aggiunge le mancanti in coda.
    """
    path = template_file()
    if not path:
        raise FileNotFoundError("Template del gioco non trovato.")
    mine = custom()
    if not mine:
        raise ValueError("Nessun preset da installare.")

    data = _read(path)
    backup = path + ".ti-companion.bak"
    if not os.path.isfile(backup):
        shutil.copy2(path, backup)

    by_name = {o["dataName"]: i for i, o in enumerate(data) if o.get("dataName")}
    added = updated = 0
    for p in mine:
        if not p.get("dataName", "").startswith(PREFIX):
            continue                      # rifiuta voci che non siano nostre
        if p["dataName"] in by_name:
            data[by_name[p["dataName"]]] = p
            updated += 1
        else:
            data.append(p)
            added += 1

    _write_atomic(path, data)
    return {"added": added, "updated": updated, "backup": backup}


def restore():
    """Riporta il template com'era, o toglie solo le nostre voci."""
    path = template_file()
    if not path:
        raise FileNotFoundError("Template del gioco non trovato.")
    backup = path + ".ti-companion.bak"
    if os.path.isfile(backup):
        shutil.copy2(backup, path)
        os.remove(backup)
        return {"restored": "backup"}

    data = _read(path)
    kept = [o for o in data if not str(o.get("dataName", "")).startswith(PREFIX)]
    _write_atomic(path, kept)
    return {"restored": "filter", "removed": len(data) - len(kept)}


def _write_atomic(path, data):
    """Scrive su un temporaneo e poi rinomina: un crash non lascia un template
    a meta', che impedirebbe al gioco di partire."""
    tmp = "%s.%d.tmp" % (path, int(time.time()))
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
