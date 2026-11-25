# hash-wasm (vendored)

Argon2id for the passphrase lock. From https://github.com/Daninet/hash-wasm v4.13.0 (commit 867bb97), MIT
licence (LICENSE). Only what Argon2id needs: lib/argon2.ts, blake2b.ts, WASMInterface.ts, util.ts, mutex.ts,
lockedCreate.ts, unchanged except import paths (".ts" added, the wasm JSON as .wasm.ts modules) and
"// @ts-nocheck". The WebAssembly is built from src/argon2.c and src/blake2b.c with clang 18 and hash-wasm's own
flags: `sh scripts/build-hash-wasm.sh <checkout>`. Checked against hash-wasm's test vectors in
tests/unit/argon2.test.ts.
