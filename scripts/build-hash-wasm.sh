#!/bin/sh
# Rebuilds app/vendor/hash-wasm/wasm/{argon2,blake2b}.wasm.ts from hash-wasm's C source, with the compiler
# flags of its own Makefile (scripts/Makefile-clang). The vendored TypeScript is hash-wasm's lib/ files with
# import paths changed (and "// @ts-nocheck" added). tests/unit/argon2.test.ts checks the result.
#   sh scripts/build-hash-wasm.sh [path to a hash-wasm checkout, at v4.13.0]
set -e
H=${1:-../hash-wasm}
OUT=app/vendor/hash-wasm/wasm
F="-flto -O3 -nostdlib -fno-builtin -ffreestanding -mexec-model=reactor --target=wasm32"
L="-Wl,--strip-all -Wl,--initial-memory=131072 -Wl,--max-memory=131072 -Wl,--no-entry -Wl,--compress-relocations -Wl,--export-dynamic"
T=$(mktemp -d)
clang $F $L -Wl,--max-memory=2147483648 -o "$T/argon2.wasm" "$H/src/argon2.c"
clang $F $L -o "$T/blake2b.wasm" "$H/src/blake2b.c"
for n in argon2 blake2b; do
  node -e 'const fs=require("fs"),c=require("crypto"),[w,n,o]=process.argv.slice(1),d=fs.readFileSync(w),h=c.createHash("sha1").update(d).digest("hex");
  fs.writeFileSync(o, `// Built from src/${n}.c of hash-wasm (see ../README.md); sha1 ${h}\nexport default ${JSON.stringify({ name: n, data: d.toString("base64"), hash: h.slice(0, 8) })};\n`)' "$T/$n.wasm" "$n" "$OUT/$n.wasm.ts"
done
rm -r "$T"
