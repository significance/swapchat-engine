# swapchat2 plan

Decentralized E2E encrypted chat on Ethereum Swarm using SOCs.
Hand-written, brutally simple, easily understandable.

## Architecture

- `swapchat_engine/` — core: handshake, encryption, SOC read/write, message polling
- `swapchat/` — original web UI (older, separate implementation)

## What works now

- secp256k1 ECDH key exchange via shared ephemeral keypair (nothing-up-my-sleeve curve)
- AES-256-CTR message encryption
- Client-side SOC construction + upload via POST /chunks
- SOC-based message storage and polling
- Session persistence via restoration tokens
- Gateway mode (zero stamp)
- Jest test suite — 11/11 pass against real bee node
- Already browser-compatible via crypto-browserify polyfill

## Phases

### Phase 0: Get everything up to date ✓
- Node 20→22, TS 4→6, Jest 27→30, Webpack 5.65→5.106
- bee-js 3→12 (unified API, no more BeeDebug)
- Removed web3, node-webcrypto-ossl
- Fixed webpack (process polyfill, core-js 3), tsconfig for TS 6

### Phase 0.5: Client-side SOC construction ✓
- SOCs constructed in JS via makeContentAddressedChunk → toSingleOwnerChunk
- Uploaded as raw chunks via POST /chunks (patched bee to detect SOC format)
- Fixed pre-existing bug: missing await in polling loops → decryption failures
- Tests use pre-bought stamps via BEE_STAMP_ID env var
- Branch: chore/modernise-engine, version 0.2.0

### Phase 1: Browser crypto audit ✓
- secp256k1 is a nothing-up-my-sleeve curve (simple verifiable params, no opaque seed)
- crypto-browserify already handles secp256k1 ECDH + AES-256-CTR in browser
- js-sha3 (keccak256) is pure JS, works everywhere
- bee-js SOC signing uses cafe-utility (pure JS), browser-compatible
- No migration to Web Crypto API needed — already works via polyfill
- Webpack bundle: 905KB

### Phase 2: Chat UI (separate plan)

### Phase 3: Post-quantum hybrid handshake

ML-KEM is purely lattice-based (Module Learning with Errors). It does NOT wrap ECDH internally.
The hybrid approach combines both at the protocol level — run both independently, concatenate secrets, derive via HKDF.
If ML-KEM is broken, ECDH still protects. If ECDH is broken (quantum), ML-KEM still protects.

#### Library
- `@noble/post-quantum` (v0.6.0) — pure JS, browser-compatible, audited
- `@noble/hashes` for HKDF-SHA256

#### ML-KEM-768 sizes
| Parameter | Bytes | Hex chars |
|-----------|-------|-----------|
| Encapsulation key (public) | 1,184 | 2,368 |
| Decapsulation key (private) | 2,400 | 4,800 |
| Ciphertext | 1,088 | 2,176 |
| Shared secret | 32 | 64 |

#### Handshake flow change

**Current flow:**
```
Alice                              Bob
  |-- token (E.priv + A.pub) ------->|     out-of-band
  |                                   |     Bob: ECDH(B.priv, A.pub) → secret
  |<-- SOC[E.addr,0]: B.pub ---------|     handshake
  |     ECDH(A.priv, B.pub) → secret |
  |-- SOC[E.addr,1]: ACK ----------->|     handshake
  |                                   |
  |== encrypted messages (AES-256-CTR, secret) ==|
```

**Hybrid flow:**
```
Alice                                          Bob
  |                                              |
  | Generate: E (shared secp256k1)               |
  |           A (own secp256k1)                  |
  |           ML-KEM keypair (encapKey, decapKey)|
  |                                              |
  |-- token (E.priv + A.pub + encapKey) -------->|  out-of-band
  |                                              |
  |                           Generate: B (own secp256k1)
  |                           ecdhSecret = ECDH(B.priv, A.pub)
  |                           (ct, mlkemSecret) = ML-KEM.encapsulate(encapKey)
  |                           secret = HKDF(ecdhSecret || mlkemSecret)
  |                                              |
  |<-- SOC[E.addr,0]: B.pub + ct ---------------|  handshake
  |                                              |
  | ecdhSecret = ECDH(A.priv, B.pub)             |
  | mlkemSecret = ML-KEM.decapsulate(decapKey, ct)|
  | secret = HKDF(ecdhSecret || mlkemSecret)     |
  |                                              |
  |-- SOC[E.addr,1]: ACK ---------------------->|  handshake
  |                                              |
  |== encrypted messages (AES-256-CTR, secret) ===========|
```

#### Size impact

**Token** (shared out-of-band):
- Current: `E.priv(64) + A.pub(130)` = 194 hex chars (97 bytes)
- Hybrid: `E.priv(64) + A.pub(130) + encapKey(2368)` = 2,562 hex chars (1,281 bytes)
- ~13x larger. Consider base64url encoding to reduce to ~1,708 chars

**Handshake SOC payload** (index 0):
- Current: `B.pub` = 65 bytes
- Hybrid: `B.pub(65) + ciphertext(1088)` = 1,153 bytes
- Within 4,096 byte SOC limit

**Restoration token**:
- Current: stores keys, re-derives ECDH secret on restore
- Hybrid: must store derived secret directly (ML-KEM decapsulation key is single-use)
- Current: `addr(40) + pub(130) + priv(64) + otherPub(130) + stamp(64)` = 428 hex
- Hybrid: `addr(40) + pub(130) + priv(64) + otherPub(130) + secret(64) + stamp(64)` = 492 hex
- `restore()` loads secret directly instead of calling `calculateSharedSecret()`

#### Files to modify

**`src/types.ts`** — add types:
```typescript
export interface MlKemEncapsulationKey extends Uint8Array {}
export interface MlKemDecapsulationKey extends Uint8Array {}
export interface MlKemCiphertext extends Uint8Array {}
```

**`src/crypto.ts`** — add functions:
- `generateMlKemKeyPair()` → `{ encapsulationKey, decapsulationKey }`
- `mlKemEncapsulate(encapKey)` → `{ ciphertext, sharedSecret }`
- `mlKemDecapsulate(decapKey, ciphertext)` → `sharedSecret`
- `deriveHybridSecret(ecdhSecret, mlkemSecret)` → `secret` (HKDF-SHA256)

**`src/swapchat.ts`** — modify:
- Add `MlKemKeyPair` property (initiator only, during handshake)
- `initiate()` — also generate ML-KEM keypair
- `getToken()` — append ML-KEM encapsulation key to token
- `parseToken()` — extract encapKey, call encapsulate, derive hybrid secret
- `getRespondentHandshakePayload()` — return `B.pub + ciphertext`
- `parseRespondentHandshakePayload()` — extract pubkey + ciphertext, decapsulate, derive hybrid secret
- `getRestorationToken()` — store derived secret instead of relying on re-derivation
- `parseRestorationToken()` — load secret directly
- `restore()` — use stored secret, skip `calculateSharedSecret()`
- Update all length constants

**`src/swapchat.test.ts`** — update:
- `TOKEN_LENGTH` → 2562
- `RESTORE_TOKEN_LENGTH` → 492
- Verify hybrid secret agreement
- Verify handshake payload contains pubkey + ciphertext

**`package.json`** — add:
- `@noble/post-quantum`
- `@noble/hashes` (for HKDF)

#### Implementation order

1. Add deps (`@noble/post-quantum`, `@noble/hashes`)
2. Add ML-KEM types to `types.ts`
3. Add ML-KEM + HKDF functions to `crypto.ts` + unit tests
4. Update `swapchat.ts` handshake (initiate, token, respond, parseHandshake)
5. Update restoration token format
6. Update `swapchat.test.ts` constants and assertions
7. Run all tests, verify 11/11 pass

#### Verification
- `npx jest src/crypto.test.ts` — ML-KEM keygen, encapsulate/decapsulate roundtrip, hybrid KDF
- `BEE_API_URL=... BEE_STAMP_ID=... npx jest --forceExit` — full 11/11 tests
- Webpack build — verify `@noble/post-quantum` bundles correctly

## Status
- 2026-04-20: Plan created.
- 2026-04-21: Phase 0 complete.
- 2026-04-22: Phase 0.5 complete. 11/11 tests pass. Phase 1 audit complete — already browser-ready.
- Next: Phase 3 (PQ handshake) or Phase 2 (Chat UI, separate plan).

## Stamps
- Budget: $1 total. Spent: ~0.21 BZZ (<$0.01).
- 7f9bae3b2ca293c5e696add592f86a8f254b0f5d447b5c4af0011ba1d2777517
- dd78f2ce6e4a112dc6a640d68e8cf319337ed7ba792531ff601f7ec818ce0349
