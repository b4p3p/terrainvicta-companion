"""Caricamento di un salvataggio e indici di comodo.

Il file e' JSON gzippato (~30 MB scompattato) con codifica utf-8-sig.
Struttura: gamestates["PavonisInteractive.TerraInvicta.TIXxxState"] ->
lista di {"Key":{"value":id}, "Value":{...}}.
"""

import gzip
import json
import os
import time

NS = "PavonisInteractive.TerraInvicta."


class SaveLocked(OSError):
    """Il gioco sta scrivendo il file: riprovare piu' tardi o usare il precedente."""


def read_save(path, retries=6, delay=0.4):
    """Legge un .gz che il gioco potrebbe avere aperto in scrittura.

    Windows blocca il file durante il salvataggio e puo' consegnarcelo troncato
    se lo prendiamo a meta': riproviamo, e trattiamo anche il gzip incompleto
    come 'occupato' invece che come errore.
    """
    last = None
    for i in range(retries):
        try:
            with gzip.open(path, "rb") as f:
                return f.read().decode("utf-8-sig")
        except (PermissionError, EOFError, gzip.BadGzipFile, OSError) as e:
            last = e
            time.sleep(delay * (i + 1))
    raise SaveLocked("%s non leggibile: %s" % (os.path.basename(path), last))


class Game:
    def __init__(self, path):
        self.path = path
        self.mtime = os.path.getmtime(path)
        self.gs = json.loads(read_save(path))["gamestates"]

        meta = self.state("TIMetadataState")
        self.meta = next(iter(meta.values()), {})
        self.nations = self.state("TINationState")
        self.regions = self.state("TIRegionState")
        self.councilors = self.state("TICouncilorState")
        self.orgs = self.state("TIOrgState")
        self.cps = self.state("TIControlPoint")
        self.factions = self.state("TIFactionState")

        self.me = self._player_faction()
        self.faction_name = {k: (v.get("displayName") or v.get("templateName") or "?")
                             for k, v in self.factions.items()}

    # -- accesso ---------------------------------------------------------

    def state(self, name):
        return {e["Key"]["value"]: e["Value"] for e in self.gs.get(NS + name, [])}

    def _player_faction(self):
        for p in self.state("TIPlayerState").values():
            if p.get("isAI") is False:
                fid = (p.get("faction") or {}).get("value")
                if fid in self.factions:
                    return self.factions[fid]
        want = (self.meta.get("playerFactionName") or "").lower()
        for f in self.factions.values():
            if (f.get("displayName") or "").lower() == want:
                return f
        raise RuntimeError("Impossibile identificare la fazione del giocatore.")

    # -- helper ----------------------------------------------------------

    def ref(self, obj, field, table):
        return table.get(((obj or {}).get(field) or {}).get("value"))

    def region_nation(self, region_id):
        r = self.regions.get(region_id)
        return self.ref(r, "nation", self.nations) if r else None

    def nation_of_region(self, region_id):
        n = self.region_nation(region_id)
        return (n or {}).get("displayName")

    def region_label(self, region_id):
        r = self.regions.get(region_id)
        if not r:
            return None
        n = self.ref(r, "nation", self.nations)
        return "%s, %s" % (r.get("displayName") or "?", (n or {}).get("displayName") or "?")

    def my_councilors(self):
        return [self.councilors[c["value"]] for c in (self.me.get("councilors") or [])
                if c["value"] in self.councilors]

    def available_councilors(self):
        return [self.councilors[c["value"]]
                for c in (self.me.get("availableCouncilors") or [])
                if c["value"] in self.councilors]

    def my_control_points(self):
        return [self.cps[c["value"]] for c in (self.me.get("controlPoints") or [])
                if c["value"] in self.cps]

    def game_date(self):
        """(anno, mese, giorno) dalla stringa GG/MM/AAAA hh:mm:ss."""
        try:
            d, m, y = [int(x) for x in
                       self.meta["gameTimeString"].split(" ")[0].split("/")]
            return y, m, d
        except Exception:
            return 0, 0, 0

    def date_key(self):
        y, m, d = self.game_date()
        return "%04d-%02d-%02d" % (y, m, d)
