"""Testi del companion che ticore manda all'interfaccia: allerte, fattori
delle missioni, errori.

I termini di gioco (missioni, org, progetti, risorse) NON stanno qui: vengono
dalla localizzazione ufficiale, in 14 lingue (gamedata.loc). Qui c'e' solo
quello che scriviamo noi, e l'interfaccia ha due lingue: italiano se la lingua
di gioco e' "ita", inglese per tutte le altre (come tiweb/lib/settings.tsx).

`LANG` e' la lingua di gioco corrente: la aggiorna Service a ogni richiesta,
cosi' anche un errore sollevato in profondita' (presets, paths, save) esce
nella lingua giusta senza passarla ovunque.
"""

LANG = "ita"


def ui(lang=None):
    return "it" if (lang or LANG) == "ita" else "en"


def t(key, lang=None, *args, **kw):
    """Testo nella lingua d'interfaccia; `%` con gli argomenti posizionali,
    `str.format` con quelli per nome."""
    s = TEXTS[key][ui(lang)]
    if args:
        return s % args
    if kw:
        return s.format(**kw)
    return s


TEXTS = {
    # ------------------------------------------------------------ allerte
    "alert.stalled.title": {"it": "Progetto fermo: %s", "en": "Stalled project: %s"},
    "alert.stalled.detail": {
        "it": "Slot %s: %.1f/%s, invariato dal %s. Quello slot non riceve ricerca.",
        "en": "Slot %s: %.1f/%s, unchanged since %s. That slot gets no research."},
    "alert.low.title": {"it": "%s in esaurimento", "en": "%s running out"},
    "alert.low.detail": {
        "it": "In cassa %.1f (soglia %s), netto ricorrente del mese %+.1f.",
        "en": "%.1f in stock (threshold %s), month's recurring net %+.1f."},
    "alert.drain.title": {"it": "%s in calo", "en": "%s falling"},
    "alert.drain.detail": {
        "it": "Netto ricorrente del mese %+.1f (senza spese una tantum) con %.1f in cassa.",
        "en": "Month's recurring net %+.1f (one-off spending excluded) with %.1f in stock."},
    "alert.cplost.title": {"it": "Punto di controllo perso: %s",
                           "en": "Control point lost: %s"},
    "alert.cplost.detail": {"it": "Da %d a %d. Qualcuno te l'ha portato via.",
                            "en": "From %d to %d. Someone took it from you."},
    "alert.cpgain.title": {"it": "Punto di controllo preso: %s",
                           "en": "Control point gained: %s"},
    "alert.cpgain.detail": {"it": "Ora ne hai %d.", "en": "You now hold %d."},
    "alert.contested.title": {"it": "Nuova fazione in %s", "en": "New faction in %s"},
    "alert.contested.detail": {"it": "%s è entrata in una nazione dove sei presente.",
                               "en": "%s entered a nation where you are present."},
    "alert.loyalty.title": {"it": "Lealtà in calo: %s", "en": "Loyalty falling: %s"},
    "alert.loyalty.detail": {
        "it": "Apparente da %s a %s. Qualcuno potrebbe stare lavorando per portartelo via.",
        "en": "Apparent from %s to %s. Someone may be working to turn them."},
    "alert.loyaltylow.title": {"it": "Lealtà bassa: %s", "en": "Low loyalty: %s"},
    "alert.loyaltylow.detail": {
        "it": "Apparente %s. Un'organizzazione che dia lealtà lo mette al sicuro.",
        "en": "Apparent %s. An organization that grants loyalty keeps them safe."},
    "alert.alien.title": {"it": "Nuovo sito alieno: %s", "en": "New alien site: %s"},
    "alert.alien.detail": {"it": "Rilevato il %s.", "en": "Detected on %s."},
    "alert.org.title": {"it": "Organizzazione acquistabile: %s",
                        "en": "Organization within reach: %s"},
    "alert.org.detail": {"it": "%s. Può tenerla: %s.", "en": "%s. Can hold it: %s."},
    "alert.org.noIncome": {"it": "nessuna rendita", "en": "no income"},
    "alert.soon.title": {"it": "Progetto quasi concluso: %s",
                         "en": "Project almost done: %s"},
    "alert.soon.detail": {"it": "Mancano circa %.0f giorni.",
                          "en": "About %.0f days to go."},
    "alert.cpcap.title": {"it": "Tetto dei punti di controllo superato",
                          "en": "Control point cap exceeded"},
    "alert.cpcap.detail": {
        "it": "Stai pagando una penalità. %s alza il tetto.",
        "en": "You are paying a penalty. %s raises the cap."},
    "alert.missions.title": {"it": "Missioni chiave non coperte",
                             "en": "Key missions not covered"},
    "alert.missions.detail": {"it": "Nessuno nel consiglio sa fare: %s.",
                              "en": "Nobody on the council can do: %s."},
    "alert.weakattrs.title": {"it": "Attributi scoperti", "en": "Uncovered attributes"},
    "alert.weakattrs.detail": {"it": "Nessun consigliere arriva a 4 in: %s.",
                               "en": "No councilor reaches 4 in: %s."},
    "alert.ruleerror.title": {"it": "Regola non valutata", "en": "Rule not evaluated"},

    # ------------------------------------------------------------ missioni
    "factor.councilor": {"it": "attributo del consigliere",
                         "en": "councilor attribute"},
    "factor.unrest": {"it": "disordini", "en": "unrest"},
    "factor.cohesion": {"it": "coesione", "en": "cohesion"},
    "factor.democracy": {"it": "democrazia", "en": "democracy"},
    "factor.gdp": {"it": "PIL", "en": "GDP"},
    "factor.population": {"it": "popolazione", "en": "population"},
    "factor.support": {"it": "sostegno alla tua fazione",
                       "en": "support for your faction"},
    "factor.industries": {"it": "industria nazionale", "en": "national industries"},
    "factor.security": {"it": "apparato di sicurezza", "en": "security apparatus"},
    "factor.UnhappyElites": {"it": "élite scontenta", "en": "unhappy elites"},
    "factor.HappyElites": {"it": "élite soddisfatta", "en": "happy elites"},
    "factor.Oligarchs": {"it": "oligarchi", "en": "oligarchs"},
    "factor.Oligarchs_Defense": {"it": "oligarchi (in difesa)", "en": "oligarchs (defending)"},
    "factor.IdentityBlocs": {"it": "blocchi identitari", "en": "identity blocs"},
    "factor.Warlords": {"it": "signori della guerra", "en": "warlords"},
    "factor.JointControlPointStat": {"it": "consiglieri nemici sul punto",
                                     "en": "enemy councilors on the point"},
    "factor.numDefendedControlPoints": {"it": "punti di controllo difesi",
                                        "en": "defended control points"},
    "factor.Defense": {"it": "difesa del punto", "en": "point defense"},
    "factor.FlatModifier": {"it": "difficoltà di base", "en": "base difficulty"},
    "factor.PherocyteResistance": {"it": "resistenza ai feromoni",
                                   "en": "pherocyte resistance"},
    "factor.IdeologicalDistance": {"it": "distanza ideologica",
                                   "en": "ideological distance"},
    "factor.NationalRivalries": {"it": "rivalità nazionali", "en": "national rivalries"},
    "factor.DefendedAsset": {"it": "bersaglio protetto", "en": "defended target"},
    "factor.AttackerAllyControlPoints": {"it": "punti di controllo alleati",
                                         "en": "allied control points"},
    "factor.AttackerAdjacentControlPoints": {"it": "punti di controllo adiacenti",
                                             "en": "adjacent control points"},
    "factor.ResourceSpent": {"it": "risorse spese sulla missione",
                             "en": "resources spent on the mission"},
    "mission.noTargeting": {
        "it": "Questa missione non prende una nazione come bersaglio: "
              "il confronto fra nazioni non si applica.",
        "en": "This mission does not target a nation: "
              "the nation comparison does not apply."},

    # ------------------------------------------------------------ flussi
    "flow.Daily Income": {"it": "Entrate correnti", "en": "Daily income"},
    "flow.Objective Completed": {"it": "Obiettivo completato",
                                 "en": "Objective completed"},
    "flow.Narrative Event": {"it": "Evento narrativo", "en": "Narrative event"},
    "flow.Hire Councilor": {"it": "Assunzione di consiglieri", "en": "Councilor hiring"},
    "flow.Purchase Org": {"it": "Acquisto di organizzazioni", "en": "Organization purchase"},
    "flow.Spoils": {"it": "Bottino", "en": "Spoils"},

    # ------------------------------------------------------------ errori
    "err.noSnapshot": {"it": "Nessuno snapshot disponibile",
                       "en": "No snapshot available"},
    "err.nationNotFound": {"it": "Nazione non trovata.", "en": "Nation not found."},
    "err.presetNotFound": {"it": "Preset personale non trovato.",
                           "en": "Personal preset not found."},
    "err.presetIsDefault": {
        "it": "È il preset predefinito della tua fazione in partita: "
              "scegline un altro come predefinito prima di eliminarlo.",
        "en": "It is your faction's default preset in the campaign: "
              "pick another default before deleting it."},
    "err.noFile": {"it": "Nessun file.", "en": "No file."},
    "err.unknownRoute": {"it": "%s %s: rotta sconosciuta", "en": "%s %s: unknown route"},
    "err.presetName": {"it": "Il preset deve avere un nome.",
                       "en": "The preset needs a name."},
    "err.unknownPriority": {"it": "Priorità sconosciuta: %s", "en": "Unknown priority: %s"},
    "err.weightNotNumber": {"it": "Peso non numerico per %s",
                            "en": "Non-numeric weight for %s"},
    "err.weightRange": {"it": "Il peso di %s deve stare fra 0 e 3",
                        "en": "The weight of %s must be between 0 and 3"},
    "err.presetEmpty": {"it": "Il preset deve accendere almeno una priorità.",
                        "en": "The preset must turn on at least one priority."},
    "err.noTemplate": {"it": "Template del gioco non trovato.",
                       "en": "Game template not found."},
    "err.noPresets": {"it": "Nessun preset da installare.",
                      "en": "No presets to install."},
    "err.importUnknown": {
        "it": "File non riconosciuto: serve un export del companion "
              "(.zip), un companion.db o un presets.json.",
        "en": "Unrecognized file: it takes a companion export "
              "(.zip), a companion.db or a presets.json."},
    "err.importNotCompanion": {
        "it": "Il database non è del companion: manca lo storico.",
        "en": "The database is not the companion's: the history is missing."},
    "err.noSaveDir": {"it": "Cartella dei salvataggi non trovata.",
                      "en": "Saves folder not found."},
    "err.noSavesIn": {"it": "Nessun salvataggio .gz trovato in %s",
                      "en": "No .gz save found in %s"},
    "err.saveLocked": {"it": "%s non leggibile: %s", "en": "%s not readable: %s"},
    "err.noFaction": {"it": "Impossibile identificare la fazione del giocatore.",
                      "en": "Cannot identify the player's faction."},
    "err.noReadableSave": {"it": "Nessun salvataggio leggibile.",
                           "en": "No readable save."},
}
