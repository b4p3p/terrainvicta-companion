# Partita demo

I salvataggi che il sito carica con «Prova la demo» (`/?demo=1`): una campagna
vera dell'autore, la Resistenza a Normale, da marzo a novembre 2026. Sono più
d'uno perché Storico, andamento delle nazioni e allerte confrontano un
salvataggio col precedente.

`manifest.json` li elenca **in ordine** con la loro mtime: il worker li carica
uno dopo l'altro e li archivia in un database in memoria, mai in IndexedDB.
La build li copia in `tiweb/public/demo/` (`scripts/sync-ticore.mjs`).

Da rifare quando un aggiornamento del gioco li rende troppo vecchi rispetto
all'estratto dei dati («Chi sono» segnala la differenza di versione).
