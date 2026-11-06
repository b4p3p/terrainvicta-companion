"""Nomi colorati dai mod con i tag rich-text di Unity (issue #1)."""
import gzip
import json

from conftest import FIXTURES, needs_game
from ticore.names import Namer
from ticore.save import NS, Game, plain


def test_plain_strips_unity_rich_text():
    assert plain("<color=#795FA3FF>Hong Kong</color>") == "Hong Kong"
    assert plain("<b><i>Hainan</i></b>") == "Hainan"
    assert plain("<#72A0E5>Hainan</color>") == "Hainan"
    assert plain("<size=120%>Cina</size>") == "Cina"
    # un `<` che non e' un tag resta
    assert plain("A < B") == "A < B"
    assert plain(None) is None


@needs_game
def test_colored_nation_name_is_translated(tmp_path):
    """Il nome colorato deve tornare quello della localizzazione, nella lingua
    scelta: senza togliere i tag il confronto in Namer._tr fallisce."""
    with gzip.open(FIXTURES[0], "rb") as f:
        data = json.loads(f.read().decode("utf-8-sig"))
    clean = Namer(Game(FIXTURES[0]), "en")
    nations = data["gamestates"][NS + "TINationState"]
    target = next(e["Value"] for e in nations
                  if e["Value"].get("displayName") and e["Value"].get("controlPoints"))
    expected = clean.nation(target)
    target["displayName"] = "<color=#795FA3FF>%s</color>" % target["displayName"]

    path = tmp_path / "colored.gz"
    with gzip.open(path, "wb") as f:
        f.write(json.dumps(data).encode("utf-8"))
    g = Game(str(path))
    n = next(v for v in g.nations.values() if v.get("templateName") == target["templateName"])
    assert "<" not in n["displayName"]
    assert Namer(g, "en").nation(n) == expected
