# Salvataggi di prova

`saves/` contiene salvataggi veri di Terra Invicta per lavorare dove il gioco
non c'è (Linux, un altro PC). Il repo è privato: se diventa pubblico, valutare
se toglierli.

I dati del gioco **non** stanno qui: sono di Pavonis Interactive e non vanno in
git (vedi ROADMAP). Senza il gioco installato serve l'estratto prodotto da
`python -m ticore.bundle <cartella>` su una macchina che ce l'ha.

```bash
export TI_SAVES=$PWD/fixtures/saves          # salvataggi
export TI_GAMEDATA=/percorso/estratto        # manifest.json, templates.json, loc/
python3 -m uvicorn tiserver.main:app --port 8732   # API locale
cd tiweb && npm run dev                       # copia l'estratto in public/gamedata
```
