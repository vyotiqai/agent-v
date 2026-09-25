#!/bin/sh
# Builds the prototype and the design system, then runs every check. Stops at the first failure.
# Needs Python 3, Node with Playwright on NODE_PATH, and runtime/artifact-type/dc-runtime.js (see README).
set -e
cd "$(dirname "$0")"
python3 tokens.py > /dev/null                 # every token pair meets its contrast minimum, both themes
python3 doc_tables.py                         # the token tables in 05-design-system.md equal tokens.py
python3 screens7.py > /dev/null               # write every screen, light and dark
python3 ds_build.py > /dev/null               # write the design system's files
python3 audit.py                              # every link on the live pages resolves to a board
node e2e.js --links                           # every screen boots; every link lands; every button works
node contrast-audit.js clean states dark      # every visible text, as rendered, meets WCAG 2 AA
node ds-check.js                              # every design-system preview renders in both themes
echo "All checks passed."
