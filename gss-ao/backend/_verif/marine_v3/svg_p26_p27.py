"""SVG des schémas des pages 26 et 27 du mémoire envoyé (specs_pages_26_27.json) dans un style : « marine » (moteur_marine,
P26 en convergence) ou un style de moteur_page (« marine-v1 »). Usage : python3 svg_p26_p27.py <style> <dossier de sortie>"""
import json, os, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "python", "schemas_gss"))
style, sortie = sys.argv[1], sys.argv[2]
os.environ["GSS_THEME"] = style
import rendu_schemas as R  # noqa: E402
os.makedirs(sortie, exist_ok=True)
for sp in json.load(open(os.path.join(ICI, "specs_pages_26_27.json"), encoding="utf-8"))["schemas"]:
    sp = dict(sp, params=R._decoder(sp["params"]))
    if R._moteur_v3():
        from moteur_marine import theme, dessin
        theme.utiliser(style, "page")
        svg = dessin.dessiner_spec(sp).rendu()
    else:
        GP = R._moteur_page()
        svg = GP.en_grand(lambda: getattr(GP, sp["gabarit"])(*sp["params"]["args"], **sp["params"]["kwargs"]), sp["gabarit"]).rendu()
    open(os.path.join(sortie, sp["id"] + ".svg"), "w", encoding="utf-8").write(R.finaliser_page(svg, sp["id"]))
    print(sp["id"])
