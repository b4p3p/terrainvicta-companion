"""Nomi di nazioni, regioni, fazioni, org e punti di controllo nella lingua scelta.

Il salvataggio li scrive gia' tradotti, **nella lingua in cui girava il
gioco** quando ha salvato: chi gioca in italiano ha «Francia» anche se il
companion e' in inglese. Qui si risale alla chiave di localizzazione e si
ritraduce:

1. si capisce la lingua del salvataggio confrontando i nomi delle fazioni con
   `TIFactionTemplate.displayName.*` di ogni lingua;
2. per ogni nome si cerca la chiave che in quella lingua da' esattamente quel
   testo, e si legge la stessa chiave nella lingua scelta;
3. se il nome non corrisponde a nessuna chiave (org generate a caso come
   «Oceanus Brands», nazioni rinominate) resta com'e'.

Le chiavi dei template di nazioni e regioni hanno il prefisso dello scenario
(`2026_FRA`), la localizzazione no (`FRA`). Una nazione ha due nomi possibili:
`displayName` o `unionDisplayName` («Inghilterra» / «Regno Unito»), e quale
usa dipende dalla partita: si prova l'uno e l'altro.

Gli identificativi stabili, da usare come chiavi, sono i `templateName`, mai
i nomi: quelli cambiano con la lingua.
"""

import re

from . import gamedata

_SCENARIO = re.compile(r"^\d{4}_")


def bare(template_name):
    """`2026_FRA` -> `FRA`: la chiave con cui la localizzazione conosce il template."""
    return _SCENARIO.sub("", template_name or "")


def _clean(v):
    # alcune righe hanno tabulazioni e un commento in coda:
    # «Port Moresby\t\t\t// dataname misspelled»
    return v.split("\t")[0].strip() if isinstance(v, str) else v


def _text(lang, key):
    return _clean(gamedata.strings(lang).get(key))


def save_language(g):
    """Lingua in cui e' scritto il salvataggio: quella che riconosce piu' nomi
    di fazione. `ita` se non se ne riconosce nessuno."""
    best, score = "ita", 0
    for lang in gamedata.available_languages():
        s = sum(1 for f in g.factions.values()
                if f.get("displayName") and _text(
                    lang, "TIFactionTemplate.displayName.%s" % f.get("templateName")) == f["displayName"])
        if s > score:
            best, score = lang, s
    return best


class Namer:
    """Traduce i nomi di un salvataggio nella lingua `lang`."""

    def __init__(self, g, lang):
        self.g = g
        self.lang = lang
        if not hasattr(g, "_save_lang"):
            g._save_lang = save_language(g)
        self.src = g._save_lang

    def _tr(self, raw, keys):
        """La prima chiave che nella lingua del salvataggio da' `raw`, letta in
        `lang`; altrimenti `raw`."""
        if not raw:
            return raw
        for k in keys:
            if _text(self.src, k) == raw:
                return _text(self.lang, k) or raw
        return raw

    # -- oggetti --------------------------------------------------------

    def nation(self, n):
        if not n:
            return None
        b = bare(n.get("templateName"))
        return self._tr(n.get("displayName"), (
            "TINationTemplate.displayName.%s" % b,
            "TINationTemplate.unionDisplayName.%s" % b))

    def region(self, r):
        if not r:
            return None
        return self._tr(r.get("displayName"),
                        ("TIRegionTemplate.displayName.%s" % bare(r.get("templateName")),))

    def faction(self, f):
        if not f:
            return None
        return self._tr(f.get("displayName"),
                        ("TIFactionTemplate.displayName.%s" % f.get("templateName"),))

    def org(self, o):
        if not o:
            return None
        return self._tr(o.get("displayName"),
                        ("TIOrgTemplate.displayName.%s" % o.get("templateName"),))

    def control_point(self, cp):
        """«Francia (Esecutivo)»: nazione e tipo del punto, ognuno tradotto."""
        if not cp:
            return None
        raw = cp.get("displayName")
        n = self.g.ref(cp, "nation", self.g.nations)
        kind = "UI.Nation.CP.%s" % cp.get("controlPointType")
        src = "%s (%s)" % ((n or {}).get("displayName"), _text(self.src, kind))
        if n and raw == src and _text(self.lang, kind):
            return "%s (%s)" % (self.nation(n), _text(self.lang, kind))
        return raw

    # -- per id ---------------------------------------------------------

    def faction_by_id(self, fid):
        return self.faction(self.g.factions.get(fid)) or "?"

    def nation_of_region(self, region_id):
        return self.nation(self.g.region_nation(region_id))

    def region_label(self, region_id):
        r = self.g.regions.get(region_id)
        if not r:
            return None
        n = self.g.ref(r, "nation", self.g.nations)
        return "%s, %s" % (self.region(r) or "?", self.nation(n) or "?")


def nation_id(n):
    """Identificativo stabile di una nazione: il templateName (`2026_FRA`)."""
    return (n or {}).get("templateName")


def faction_id(f):
    return (f or {}).get("templateName")
