"""Redimensionne (in place) les images d'un dossier à une dimension max, pour
accélérer le rendu Marp/Chromium (les images pleine résolution ralentissent
fortement la mise en page). Non destructif au-delà du strict nécessaire :
seules les images plus grandes que --max sont réduites, format conservé.

Usage : py downscale_images.py --dir <media_dir> --max 1000 [--prefix db_]
Sortie : JSON {"processed": n, "resized": m} sur stdout.
"""
import argparse
import json
import os
import sys

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="Dossier contenant les images")
    ap.add_argument("--max", type=int, default=1000, help="Plus grande dimension cible (px)")
    ap.add_argument("--prefix", default="", help="Ne traiter que les fichiers commençant par ce préfixe")
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        print(json.dumps({"processed": 0, "resized": 0}))
        return 0

    processed = 0
    resized = 0
    for name in os.listdir(args.dir):
        if args.prefix and not name.startswith(args.prefix):
            continue
        path = os.path.join(args.dir, name)
        if not os.path.isfile(path):
            continue
        try:
            with Image.open(path) as im:
                fmt = im.format  # conserve le format d'origine (PNG/JPEG/…)
                w, h = im.size
                processed += 1
                if max(w, h) <= args.max:
                    continue
                im = im.copy()
                im.thumbnail((args.max, args.max), Image.LANCZOS)
                save_kwargs = {}
                if fmt in ("JPEG", "JPG", "MPO"):
                    fmt = "JPEG"
                    if im.mode not in ("RGB", "L"):
                        im = im.convert("RGB")
                    save_kwargs = {"quality": 82, "optimize": True}
                elif fmt == "PNG":
                    save_kwargs = {"optimize": True}
                im.save(path, format=fmt, **save_kwargs)
                resized += 1
        except Exception as exc:  # noqa: BLE001 — étape best-effort, on continue
            print(f"[downscale] {name}: {exc}", file=sys.stderr)

    print(json.dumps({"processed": processed, "resized": resized}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
