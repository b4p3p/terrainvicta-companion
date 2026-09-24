"""Export e import dei dati del companion: storico, note, obiettivi, preset
personali.

Nel browser questi dati vivono in quel browser (SQLite dentro Pyodide,
copiato in IndexedDB): senza un export si perdono cambiando PC o cancellando i
dati del sito, e lo storico accumulato dall'API locale in
~/.terrainvicta-companion/ non ci arriverebbe mai.

L'export e' uno zip con `companion.db` e `presets.json`. L'import accetta lo
zip, un `companion.db` nudo (quello dell'API locale) o un `presets.json`, e
**unisce** invece di sostituire: si puo' importare due volte senza doppioni.
"""

import io
import json
import os
import sqlite3
import tempfile
import zipfile

from . import presets

DB_NAME = "companion.db"
PRESETS_NAME = "presets.json"


def summary(con):
    """Cosa c'e' da esportare, per mostrarlo prima di farlo."""
    one = lambda q: con.execute(q).fetchone()[0]
    return {
        "snapshots": one("SELECT COUNT(*) FROM snapshots"),
        "campaigns": one("SELECT COUNT(DISTINCT campaign) FROM snapshots"),
        "notes": one("SELECT COUNT(*) FROM notes"),
        "goals": one("SELECT COUNT(*) FROM goals"),
        "presets": len(presets.user()),
        "bytes": one("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()"),
    }


def export(con):
    """Lo zip, come bytes. Il database passa dall'API di backup di SQLite:
    una copia coerente anche se nel frattempo arriva un salvataggio."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, DB_NAME)
        dst = sqlite3.connect(path)
        con.backup(dst)
        dst.close()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(path, DB_NAME)
            z.writestr(PRESETS_NAME, json.dumps(presets.user(), ensure_ascii=False, indent=2))
        return buf.getvalue()


def import_bytes(con, data):
    """Unisce un export (zip), un companion.db o un presets.json. Torna i conteggi."""
    out = {"snapshots": 0, "snapshotsNewer": 0, "notes": 0, "goals": 0, "presets": 0}
    if data[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = set(z.namelist())
            if DB_NAME in names:
                out.update(_merge_db(con, z.read(DB_NAME)))
            if PRESETS_NAME in names:
                out["presets"] = _merge_presets(json.loads(z.read(PRESETS_NAME)))
    elif data[:16] == b"SQLite format 3\x00":
        out.update(_merge_db(con, data))
    else:
        try:
            parsed = json.loads(data.decode("utf-8-sig"))
        except (UnicodeDecodeError, ValueError):
            raise ValueError("File non riconosciuto: serve un export del companion "
                             "(.zip), un companion.db o un presets.json.")
        out["presets"] = _merge_presets(parsed)
    return out


def _merge_db(con, raw):
    """Unisce un altro database del companion.

    Snapshot: per (campagna, data di gioco), vince quello archiviato per ultimo.
    Note e obiettivi: aggiunti se non c'e' gia' la stessa voce (stessa
    campagna, stesso soggetto/titolo, stesso istante di creazione).
    """
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "import.db")
        with open(path, "wb") as f:
            f.write(raw)
        con.execute("ATTACH DATABASE ? AS src", (path,))
        try:
            have = {r[0] for r in con.execute(
                "SELECT name FROM src.sqlite_master WHERE type='table'")}
            if "snapshots" not in have:
                raise ValueError("Il database non e' del companion: manca lo storico.")
            before = con.total_changes
            new = con.execute(
                "SELECT COUNT(*) FROM src.snapshots s WHERE NOT EXISTS (SELECT 1 FROM "
                "snapshots t WHERE t.campaign=s.campaign AND t.date_key=s.date_key)").fetchone()[0]
            con.execute(
                "INSERT INTO snapshots (campaign,date_key,game_date,mtime,taken_at,payload) "
                "SELECT campaign,date_key,game_date,mtime,taken_at,payload FROM src.snapshots "
                "WHERE true ON CONFLICT(campaign,date_key) DO UPDATE SET "
                "game_date=excluded.game_date, mtime=excluded.mtime, "
                "taken_at=excluded.taken_at, payload=excluded.payload "
                "WHERE excluded.taken_at > snapshots.taken_at")
            touched = con.total_changes - before
            notes = goals = 0
            if "notes" in have:
                notes = con.execute(
                    "INSERT INTO notes (campaign,subject,body,created,updated) "
                    "SELECT campaign,subject,body,created,updated FROM src.notes s "
                    "WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.campaign=s.campaign "
                    "AND n.subject=s.subject AND n.created=s.created)").rowcount
            if "goals" in have:
                goals = con.execute(
                    "INSERT INTO goals (campaign,title,kind,target,amount,due,done,created) "
                    "SELECT campaign,title,kind,target,amount,due,done,created FROM src.goals s "
                    "WHERE NOT EXISTS (SELECT 1 FROM goals g WHERE g.campaign=s.campaign "
                    "AND g.title=s.title AND g.created=s.created)").rowcount
            con.commit()
        finally:
            con.execute("DETACH DATABASE src")
    return {"snapshots": new, "snapshotsNewer": touched - new, "notes": notes, "goals": goals}


def _merge_presets(data):
    """Preset personali per dataName: quelli importati sostituiscono gli omonimi."""
    incoming = [o for o in (data if isinstance(data, list) else [])
                if isinstance(o, dict)
                and str(o.get("dataName", "")).startswith(presets.USER_PREFIX)]
    if not incoming:
        return 0
    mine = {o["dataName"]: o for o in presets.user()}
    for o in incoming:
        mine[o["dataName"]] = o
    presets._write_user(list(mine.values()))
    return len(incoming)


def export_name(snap):
    """terrainvicta-companion-<data di gioco>.zip, o senza data se non c'e'."""
    key = (snap or {}).get("dateKey")
    return "terrainvicta-companion%s.zip" % ("-" + key if key else "")
