"""Preset di priorita' nazionali: lettura, analisi e installazione.

I preset personalizzati del giocatore vivono in `customPresets`, un campo
**dentro il salvataggio**: non c'e' modo, nel gioco, di portarli in una partita
nuova. I template invece si caricano a ogni avvio.

Il sistema dei mod risolverebbe il problema, ma in Terra Invicta **attivare i
mod disattiva gli achievement** — basta la casella nel menu, senza nemmeno un
mod acceso, e il salvataggio lo registra in `playedWithMods`. Per questo i
preset **non sono confezionati come mod**: si scrivono direttamente in
`TIPriorityPresetTemplate.json`, aggiungendo voci con un `dataName` nuovo. Il
gioco non le vede come mod e `playedWithMods` resta falso.

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
USER_PREFIX = PREFIX + "U_"     # ...e fra le nostre, quelle create dall'utente
MARK = "- "                     # davanti al nome, solo nella lista del gioco
_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SOURCE = os.path.join(_REPO, "assets", "presets", TEMPLATE)

# quali priorita' contano come spesa militare, per il riepilogo
_MILITARY = ("military", "foundMilitary", "army", "navy",
             "nuclearProgram", "initNuclearWeapons", "spaceDefense", "sto")


def template_file():
    d = paths.template_dir()
    p = os.path.join(d, TEMPLATE) if d else None
    return p if p and os.path.isfile(p) else None


# Nel browser il template del gioco non si puo' ne' leggere ne' scrivere
# (Chrome blocca Program Files): arriva dall'estratto (bundle.py) e il file
# completo si scarica con `export()`, da copiare a mano in Templates.
_bundled = None


def use_bundled_template(data):
    global _bundled
    _bundled = [o for o in (data or []) if isinstance(o, dict)]


def game_original():
    """Il template del gioco senza le nostre voci: dal backup se c'e', cioe'
    com'era prima che lo toccassimo, altrimenti dal file ripulito."""
    path = template_file()
    if not path:
        return None
    backup = path + ".ti-companion.bak"
    data = _read(backup if os.path.isfile(backup) else path)
    return [o for o in data if not str(o.get("dataName", "")).startswith(PREFIX)]


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


def shipped():
    """I preset distribuiti col progetto."""
    try:
        return _read(_SOURCE)
    except (OSError, ValueError):
        return []


def user_file():
    return os.path.join(paths.data_dir(), "presets.json")


def user():
    """I preset creati dall'utente: suoi, quindi fuori dal repo."""
    try:
        data = _read(user_file())
    except (OSError, ValueError):
        return []
    return [o for o in data if isinstance(o, dict)
            and str(o.get("dataName", "")).startswith(USER_PREFIX)]


def custom():
    """I preset che il companion sa installare: distribuiti piu' personali."""
    return shipped() + user()


def view(preset, lang="ita", installed=False, stale=False):
    name = gamedata.loc(lang, "TIPriorityPresetTemplate", "displayName",
                        preset["dataName"],
                        preset.get("friendlyName") or preset["dataName"])
    mine = preset["dataName"].startswith(PREFIX)
    if mine and name.startswith(MARK):
        name = name[len(MARK):]           # il trattino serve solo in partita
    a = analyse(preset)
    order = list(gamedata.PRIORITIES)
    rank = {k: i for i, k in enumerate(order)}
    prio = sorted(a["weights"].items(),
                  key=lambda kv: (-kv[1], rank.get(kv[0], len(order))))
    return dict(a,
                id=preset["dataName"],
                name=name,
                faction=preset.get("factionName"),
                mine=mine,
                editable=preset["dataName"].startswith(USER_PREFIX),
                installed=installed,
                stale=stale,
                priorities=[dict(gamedata.priority_view(lang, k), weight=w,
                                 share=w / a["total"]) for k, w in prio])


def catalog(lang="ita"):
    """Tutte le priorita' che un preset puo' accendere, nell'ordine del gioco."""
    return [gamedata.priority_view(lang, k) for k in gamedata.PRIORITIES]


def _slug(text):
    out = "".join(c if c.isalnum() else "_" for c in text.strip())
    return "_".join(p for p in out.split("_") if p)[:40] or "Preset"


def save_user(name, weights, data_name=None):
    """Crea o aggiorna un preset dell'utente. Torna la voce scritta.

    I pesi validi sono 1-3; 0 o assente spegne la priorita', come nel gioco.
    """
    name = (name or "").strip()
    if not name:
        raise ValueError("Il preset deve avere un nome.")
    clean = {}
    for k, v in (weights or {}).items():
        if k not in gamedata.PRIORITIES:
            raise ValueError("Priorita' sconosciuta: %s" % k)
        try:
            v = int(v)
        except (TypeError, ValueError):
            raise ValueError("Peso non numerico per %s" % k)
        if not 0 <= v <= 3:
            raise ValueError("Il peso di %s deve stare fra 0 e 3" % k)
        if v:
            clean[k] = v
    if not clean:
        raise ValueError("Il preset deve accendere almeno una priorita'.")

    mine = user()
    if data_name:
        if not any(o["dataName"] == data_name for o in mine):
            raise KeyError(data_name)
    else:
        taken = {o["dataName"] for o in custom()}
        base = USER_PREFIX + _slug(name)
        data_name, i = base, 2
        while data_name in taken:
            data_name, i = "%s_%d" % (base, i), i + 1

    entry = {"dataName": data_name, "friendlyName": MARK + name,
             "nationalAIOption": False}
    # nell'ordine del gioco, cosi' il file resta leggibile
    for k in gamedata.PRIORITIES:
        if k in clean:
            entry[k + "Setting"] = clean[k]

    out = [o for o in mine if o["dataName"] != data_name]
    at = next((i for i, o in enumerate(mine) if o["dataName"] == data_name),
              len(out))
    out.insert(at, entry)
    _write_user(out)
    return entry


def delete_user(data_name):
    mine = user()
    kept = [o for o in mine if o["dataName"] != data_name]
    if len(kept) == len(mine):
        raise KeyError(data_name)
    _write_user(kept)


def _write_user(data):
    os.makedirs(paths.data_dir(), exist_ok=True)
    _write_atomic(user_file(), data)


def status(lang="ita"):
    """Preset del gioco piu' i nostri, con lo stato di installazione."""
    path = template_file()
    if not path and _bundled is not None:
        return _status(_bundled, lang, mode="download")
    if not path:
        return {"ok": False, "error": "Template del gioco non trovato.",
                "path": None, "presets": [], "pending": []}
    try:
        data = _read(path)
    except (OSError, ValueError) as e:
        return {"ok": False, "error": str(e), "path": path,
                "presets": [], "pending": []}
    return _status(data, lang, path=path)


def _status(data, lang, path=None, mode="direct"):
    """`direct`: il companion scrive nel gioco (API locale). `download`: nel
    browser, dove si puo' solo scaricare il file; li' non sappiamo cosa c'e'
    nel gioco, quindi niente installato / da aggiornare."""
    direct = mode == "direct"

    have = {o.get("dataName"): o for o in data}
    # solo i preset del giocatore: le opzioni dell'AI nazionale non si scelgono.
    # I nostri restano fuori: hanno gia' la loro sezione, e una volta installati
    # comparirebbero due volte.
    listed = [view(o, lang, installed=True) for o in data
              if not o.get("nationalAIOption")
              and not str(o.get("dataName", "")).startswith(PREFIX)]
    ours = custom()
    # `stale`: nel gioco c'e' una versione diversa, va reinstallato
    pending = [view(o, lang, installed=direct and o["dataName"] in have,
                    stale=direct and o["dataName"] in have and have[o["dataName"]] != o)
               for o in ours]
    # voci nostre rimaste nel gioco dopo che l'utente le ha cancellate
    names = {o["dataName"] for o in ours}
    orphans = [n for n in have if str(n).startswith(PREFIX) and n not in names]
    return {
        "ok": True,
        "error": None,
        "mode": mode,
        "path": path,
        "file": TEMPLATE,
        "writable": direct and os.access(path, os.W_OK),
        "backup": direct and os.path.isfile(path + ".ti-companion.bak"),
        "installed": sum(1 for p in pending if p["installed"]),
        "stale": sum(1 for p in pending if p["stale"]) + len(orphans),
        "priorities": catalog(lang),
        "presets": listed,
        "pending": pending,
    }


def install(lang="ita"):
    """Aggiunge i nostri preset al template del gioco. Idempotente.

    Non tocca nessuna voce altrui: sostituisce quelle col nostro prefisso,
    aggiunge le mancanti in coda e toglie le nostre che non esistono piu'
    (preset personali cancellati dall'utente).
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

    data, added, updated, removed = _merge(data, mine)
    _write_atomic(path, data)
    return {"added": added, "updated": updated, "removed": removed,
            "backup": backup}


def export():
    """Il template completo, gioco + nostri, come testo: nel browser si
    scarica e l'utente lo copia in Templates al posto dell'originale."""
    base = _bundled if _bundled is not None else game_original()
    if base is None:
        raise FileNotFoundError("Template del gioco non trovato.")
    mine = custom()
    if not mine:
        raise ValueError("Nessun preset da installare.")
    data, added, _, _ = _merge([dict(o) for o in base], mine)
    return {"file": TEMPLATE, "count": added,
            "content": json.dumps(data, ensure_ascii=False, indent=2) + "\n"}


def _merge(data, mine):
    """Le nostre voci dentro il template: sostituisce quelle col nostro
    prefisso, aggiunge le mancanti in coda, toglie le nostre che non esistono
    piu'. Non tocca nessuna voce altrui."""
    wanted = {p.get("dataName") for p in mine}
    before = len(data)
    data = [o for o in data if not str(o.get("dataName", "")).startswith(PREFIX)
            or o.get("dataName") in wanted]
    removed = before - len(data)

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
    return data, added, updated, removed


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
