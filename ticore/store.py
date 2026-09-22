"""Persistenza: storico degli snapshot, note e obiettivi.

SQLite in ~/.terrainvicta-companion/companion.db. Gli snapshot sono indicizzati
per (campagna, data di gioco): rigiocare lo stesso giorno sovrascrive, cosi'
ricaricare un salvataggio non sporca lo storico.
"""

import json
import os
import sqlite3
import time

from . import paths

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    campaign   TEXT NOT NULL,
    date_key   TEXT NOT NULL,
    game_date  TEXT NOT NULL,
    mtime      REAL NOT NULL,
    taken_at   REAL NOT NULL,
    payload    TEXT NOT NULL,
    PRIMARY KEY (campaign, date_key)
);
CREATE INDEX IF NOT EXISTS idx_snap_date ON snapshots(campaign, date_key);

CREATE TABLE IF NOT EXISTS notes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign  TEXT NOT NULL,
    subject   TEXT NOT NULL,          -- 'nation:Francia', 'councilor:123', 'general'
    body      TEXT NOT NULL,
    created   REAL NOT NULL,
    updated   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes ON notes(campaign, subject);

CREATE TABLE IF NOT EXISTS goals (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign  TEXT NOT NULL,
    title     TEXT NOT NULL,
    kind      TEXT,                   -- 'controlNation', 'project', 'resource', 'free'
    target    TEXT,                   -- es. 'Regno Unito'
    amount    REAL,                   -- es. 4 (punti di controllo)
    due       TEXT,                   -- data di gioco AAAA-MM-GG
    done      INTEGER NOT NULL DEFAULT 0,
    created   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals ON goals(campaign, done);
"""


def connect():
    db = os.path.join(paths.data_dir(), "companion.db")
    con = sqlite3.connect(db, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def campaign_id(snap):
    """Identifica la campagna: fazione + difficolta' + avvio reale.

    `campaignStart` viene da `realWorldCampaignStart` nel salvataggio ed e'
    cio' che distingue due partite giocate con la stessa fazione alla stessa
    difficolta'. Senza, ricominciare una campagna faceva collidere lo storico
    con quello della precedente: diff falsati e righe sovrascritte.
    """
    return "%s|%s|%s" % (snap.get("faction") or "?",
                         snap.get("difficulty") or "?",
                         snap.get("campaignStart") or "?")


# ---------------------------------------------------------------- snapshot

def save_snapshot(con, snap):
    con.execute(
        "INSERT INTO snapshots (campaign,date_key,game_date,mtime,taken_at,payload) "
        "VALUES (?,?,?,?,?,?) ON CONFLICT(campaign,date_key) DO UPDATE SET "
        "mtime=excluded.mtime, taken_at=excluded.taken_at, payload=excluded.payload, "
        "game_date=excluded.game_date",
        (campaign_id(snap), snap["dateKey"], snap["date"], snap["mtime"],
         time.time(), json.dumps(snap, ensure_ascii=False)))
    con.commit()


def previous_snapshot(con, snap):
    """Lo snapshot immediatamente precedente della stessa campagna."""
    row = con.execute(
        "SELECT payload FROM snapshots WHERE campaign=? AND date_key<? "
        "ORDER BY date_key DESC LIMIT 1",
        (campaign_id(snap), snap["dateKey"])).fetchone()
    return json.loads(row["payload"]) if row else None


def history(con, campaign, limit=400):
    """Serie temporali leggere per i grafici, senza rileggere i payload interi."""
    rows = con.execute(
        "SELECT date_key, game_date, payload FROM snapshots WHERE campaign=? "
        "ORDER BY date_key ASC LIMIT ?", (campaign, limit)).fetchall()
    out = []
    for r in rows:
        p = json.loads(r["payload"])
        out.append({
            "dateKey": r["date_key"],
            "date": r["game_date"],
            "resources": p.get("resources", {}),
            "net": (p.get("flows") or {}).get("net", {}),
            "cp": (p.get("controlPoints") or {}).get("mine", 0),
            "council": (p.get("council") or {}).get("size", 0),
            "research": (p.get("projects") or {}).get("rate", 0),
        })
    return out


def campaigns(con):
    rows = con.execute(
        "SELECT campaign, COUNT(*) n, MIN(date_key) a, MAX(date_key) b "
        "FROM snapshots GROUP BY campaign ORDER BY b DESC").fetchall()
    return [dict(r) for r in rows]


# ------------------------------------------------------------------- note

def list_notes(con, campaign, subject=None):
    q = "SELECT * FROM notes WHERE campaign=?"
    a = [campaign]
    if subject:
        q += " AND subject=?"
        a.append(subject)
    return [dict(r) for r in con.execute(q + " ORDER BY updated DESC", a)]


def add_note(con, campaign, subject, body):
    now = time.time()
    cur = con.execute(
        "INSERT INTO notes (campaign,subject,body,created,updated) VALUES (?,?,?,?,?)",
        (campaign, subject, body, now, now))
    con.commit()
    return cur.lastrowid


def update_note(con, note_id, body):
    con.execute("UPDATE notes SET body=?, updated=? WHERE id=?",
                (body, time.time(), note_id))
    con.commit()


def delete_note(con, note_id):
    con.execute("DELETE FROM notes WHERE id=?", (note_id,))
    con.commit()


# -------------------------------------------------------------- obiettivi

def list_goals(con, campaign):
    return [dict(r) for r in con.execute(
        "SELECT * FROM goals WHERE campaign=? ORDER BY done ASC, due ASC", (campaign,))]


def add_goal(con, campaign, title, kind=None, target=None, amount=None, due=None):
    cur = con.execute(
        "INSERT INTO goals (campaign,title,kind,target,amount,due,created) "
        "VALUES (?,?,?,?,?,?,?)",
        (campaign, title, kind, target, amount, due, time.time()))
    con.commit()
    return cur.lastrowid


def set_goal_done(con, goal_id, done=True):
    con.execute("UPDATE goals SET done=? WHERE id=?", (1 if done else 0, goal_id))
    con.commit()


def delete_goal(con, goal_id):
    con.execute("DELETE FROM goals WHERE id=?", (goal_id,))
    con.commit()


def goal_progress(con, campaign, snap):
    """Stato di avanzamento degli obiettivi rispetto allo snapshot corrente."""
    out = []
    by_nation = (snap.get("controlPoints") or {}).get("byNation", {})
    res = snap.get("resources", {})
    projects = {p["id"]: p for p in (snap.get("projects") or {}).get("items", [])}
    for gl in list_goals(con, campaign):
        cur, total = None, gl["amount"]
        if gl["kind"] == "controlNation" and gl["target"]:
            cur = by_nation.get(gl["target"], 0)
            if not total:
                n = next((x for x in snap["nations"] if x["name"] == gl["target"]), None)
                total = n["cp"] if n else None
        elif gl["kind"] == "resource" and gl["target"]:
            cur = res.get(gl["target"])
        elif gl["kind"] == "project" and gl["target"]:
            p = projects.get(gl["target"])
            cur, total = (p or {}).get("accumulated"), (p or {}).get("cost")
        late = bool(gl["due"] and snap["dateKey"] > gl["due"] and not gl["done"])
        out.append(dict(gl, current=cur, total=total, late=late))
    return out
