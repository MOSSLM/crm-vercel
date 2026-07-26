#!/usr/bin/env python3
"""Scope la CSS de la maquette Rendez-vous sous `.rv-scope`.

La maquette Claude Design est un document autonome (`:root`, `html, body`, `*`…).
Pour l'intégrer sans polluer le reste du CRM — ni écraser les tokens shadcn —
on préfixe chaque sélecteur par `.rv-scope`. Les tokens de la maquette ne
vivent alors QUE dans la section Rendez-vous.

Usage: python3 scripts/scope-rdv-css.py <src.css> [<src2.css> …] > out.css
"""
import re
import sys

SCOPE = ".rv-scope"

# Sélecteurs globaux du document → deviennent la racine du scope.
ROOT_MAP = {
    ":root": SCOPE,
    "html": SCOPE,
    "body": SCOPE,
    "html, body": SCOPE,
    "*": f"{SCOPE} *",
    "::selection": f"{SCOPE} ::selection",
}


def scope_selector(sel: str) -> str:
    sel = sel.strip()
    if not sel:
        return sel
    if sel in ROOT_MAP:
        return ROOT_MAP[sel]
    # `*::-webkit-scrollbar` etc.
    if sel.startswith("*::"):
        return f"{SCOPE} {sel}"
    # `body.mount-pending #app` → on ignore (spécifique au prototype)
    if sel.startswith("body"):
        return f"{SCOPE}{sel[4:]}"
    if sel.startswith("html"):
        return f"{SCOPE}{sel[4:]}"
    return f"{SCOPE} {sel}"


def scope_selector_list(sel_list: str) -> str:
    # Découpe sur les virgules de premier niveau (hors parenthèses).
    parts, depth, cur = [], 0, ""
    for ch in sel_list:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return ", ".join(scope_selector(p) for p in parts if p.strip())


def transform(css: str) -> str:
    out, i, n = [], 0, len(css)
    while i < n:
        # Espaces / sauts de ligne : émis tels quels, sinon ils se retrouvent
        # collés au sélecteur suivant (et le commentaire qui suit avec).
        ws = re.match(r"\s+", css[i:])
        if ws:
            out.append(ws.group(0))
            i += ws.end()
            continue
        # Commentaires
        if css.startswith("/*", i):
            end = css.find("*/", i + 2)
            end = n if end == -1 else end + 2
            out.append(css[i:end])
            i = end
            continue
        # At-rules
        if css[i] == "@":
            m = re.match(r"@([a-zA-Z-]+)([^{;]*)", css[i:])
            name = m.group(1).lower()
            prelude = css[i : i + m.end()]
            j = i + m.end()
            if j < n and css[j] == "{":
                block, j = read_block(css, j)
                if name in ("media", "supports", "layer", "container"):
                    # Conteneur : on scope récursivement son contenu.
                    out.append(prelude + "{" + transform(block) + "}")
                else:
                    # keyframes, font-face… : contenu laissé intact.
                    out.append(prelude + "{" + block + "}")
                i = j
            else:
                # @import / @charset : ligne simple, conservée telle quelle.
                end = css.find(";", i)
                end = n if end == -1 else end + 1
                out.append(css[i:end])
                i = end
            continue
        # Règle normale : sélecteurs jusqu'à `{`
        brace = css.find("{", i)
        if brace == -1:
            out.append(css[i:])
            break
        sel = css[i:brace]
        leading = sel[: len(sel) - len(sel.lstrip())]
        block, j = read_block(css, brace)
        out.append(leading + scope_selector_list(sel) + "{" + block + "}")
        i = j
    return "".join(out)


def read_block(css: str, brace_idx: int):
    """Renvoie (contenu, index_apres_accolade_fermante)."""
    depth, k = 0, brace_idx
    while k < len(css):
        if css.startswith("/*", k):
            end = css.find("*/", k + 2)
            k = len(css) if end == -1 else end + 2
            continue
        if css[k] == "{":
            depth += 1
        elif css[k] == "}":
            depth -= 1
            if depth == 0:
                return css[brace_idx + 1 : k], k + 1
        k += 1
    return css[brace_idx + 1 :], len(css)


if __name__ == "__main__":
    print(
        "/* GÉNÉRÉ — ne pas éditer à la main.\n"
        " * Source : claude design/Rendez-vous/{crm-base,rdv}.css\n"
        " * Régénérer : python3 scripts/scope-rdv-css.py "
        '"claude design/Rendez-vous/crm-base.css" '
        '"claude design/Rendez-vous/rdv.css" > src/components/scheduling/rdv-skin.css\n'
        " *\n"
        " * Tous les sélecteurs sont préfixés par .rv-scope : les tokens de la\n"
        " * maquette (--accent orange, --radius, --font-*) restent confinés à la\n"
        " * section Rendez-vous et n'écrasent jamais le design system du CRM.\n"
        " */"
    )
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as fh:
            print(transform(fh.read()))
