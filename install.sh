#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Codem GNOME Shell Extension - install script
# Compiles TypeScript then copies files to the GNOME extensions directory.
# -----------------------------------------------------------------------------
set -e

EXTENSION_UUID="codem@jinmiles.github.io"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DEST="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "==================================================="
echo "  Codem - Codex Usage Monitor  /  install"
echo "==================================================="

# 1. Install npm deps if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo ""
    echo "Installing npm dependencies..."
    npm install --prefix "$SCRIPT_DIR"
fi

# 2. Compile TypeScript
echo ""
echo "Compiling TypeScript..."
npm run build --prefix "$SCRIPT_DIR"
echo "  -> build/extension.js"

# 3. Strip CommonJS header added by tsc (not valid in GJS)
# tsc adds: "use strict"; Object.defineProperty(exports, "__esModule", ...) when it detects a module.
# Our file has no import/export so tsc should output a clean script, but strip just in case.
BUILT="$SCRIPT_DIR/build/extension.js"
sed -i '/^"use strict";$/d' "$BUILT" 2>/dev/null || true
sed -i '/^Object\.defineProperty(exports/d' "$BUILT" 2>/dev/null || true

# Prepend 'use strict' cleanly
echo '"use strict";' | cat - "$BUILT" > "$BUILT.tmp" && mv "$BUILT.tmp" "$BUILT"

# 4. Copy files to extension directory
echo ""
echo "Copying extension files..."
mkdir -p "$EXTENSION_DEST"
cp "$BUILT"                       "$EXTENSION_DEST/extension.js"
cp "$SCRIPT_DIR/src/metadata.json" "$EXTENSION_DEST/metadata.json"
cp "$SCRIPT_DIR/src/stylesheet.css" "$EXTENSION_DEST/stylesheet.css"
echo "  -> $EXTENSION_DEST"

# 5. List installed files
echo ""
echo "Installed files:"
ls -lh "$EXTENSION_DEST/"

# 6. Enable extension
echo ""
echo "Enabling extension..."
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null && \
        echo "  Extension enabled." || \
        echo "  Could not enable automatically."
fi

echo ""
echo "==================================================="
echo "  Done. Restart GNOME Shell to apply changes."
echo ""
echo "  X11:     Alt+F2  ->  r  ->  Enter"
echo "  Wayland: log out and log back in"
echo "==================================================="
