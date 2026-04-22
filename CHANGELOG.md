# Changelog

## 0.3.0 — Post-Quantum Hybrid Handshake

Branch: `feature/pq-hybrid-handshake`

### What changed

The key exchange is now a hybrid of ML-KEM-768 (post-quantum, FIPS 203) and secp256k1 ECDH (classical). Both run independently during the handshake, and their shared secrets are combined via HKDF-SHA256 to produce the final encryption key.

ML-KEM is purely lattice-based — it does NOT internally use ECDH. The hybrid combination happens at the protocol level: if ECDH is broken by a quantum computer, ML-KEM still protects. If ML-KEM turns out to be weak, ECDH still protects.

### Token format

The invitation token (shared out-of-band) now includes the ML-KEM encapsulation key:

| Field | Hex chars | Bytes |
|-------|-----------|-------|
| Shared secp256k1 private key | 64 | 32 |
| Initiator secp256k1 public key | 130 | 65 |
| ML-KEM-768 encapsulation key | 2,368 | 1,184 |
| **Total** | **2,562** | **1,281** |

Previously: 194 hex chars (97 bytes).

### Handshake SOC payload

The respondent's handshake chunk now contains both the secp256k1 public key and ML-KEM ciphertext:

| Field | Bytes |
|-------|-------|
| secp256k1 public key | 65 |
| ML-KEM-768 ciphertext | 1,088 |
| **Total** | **1,153** |

Previously: 65 bytes (just the public key). Still within the 4,096 byte SOC payload limit.

### Restoration token

The restoration token now stores the derived shared secret directly (64 hex chars / 32 bytes) instead of relying on ECDH re-derivation. This is necessary because ML-KEM encapsulation is a one-shot operation — you can't re-derive the ML-KEM shared secret from stored keys.

New length: 492 hex chars (previously 428).

### Handshake flow

**Respondent (Bob) — on receiving the token:**
1. Generate own secp256k1 keypair
2. Compute `ecdhSecret = ECDH(ownPrivate, alicePubKey)`
3. Compute `(ciphertext, mlkemSecret) = ML-KEM.encapsulate(aliceEncapKey)`
4. Derive `secret = HKDF-SHA256(ecdhSecret || mlkemSecret, info="swapchat-hybrid")`
5. Send `ownPubKey + ciphertext` via SOC

**Initiator (Alice) — on receiving the handshake SOC:**
1. Extract Bob's public key (first 65 bytes) and ML-KEM ciphertext (remaining 1088 bytes)
2. Compute `ecdhSecret = ECDH(ownPrivate, bobPubKey)`
3. Compute `mlkemSecret = ML-KEM.decapsulate(decapKey, ciphertext)`
4. Derive `secret = HKDF-SHA256(ecdhSecret || mlkemSecret, info="swapchat-hybrid")`

Both arrive at the same hybrid shared secret.

### Dependencies added

- `@noble/post-quantum` (v0.6.1) — ML-KEM-768 implementation, pure JS, browser-compatible
- `@noble/hashes` (v2.2.0) — HKDF-SHA256 implementation

### Files changed

- `src/crypto.ts` — added `generateMlKemKeyPair()`, `mlKemEncapsulate()`, `mlKemDecapsulate()`, `deriveHybridSecret()`
- `src/types.ts` — added `MlKemEncapsulationKey`, `MlKemDecapsulationKey`, `MlKemCiphertext`, `MlKemKeyPair`
- `src/swapchat.ts` — updated `initiate()`, `getToken()`, `parseToken()`, `getRespondentHandshakePayload()`, `parseRespondentHandshakePayload()`, `getRestorationToken()`, `parseRestorationToken()`, `restore()`
- `src/crypto.test.ts` — added ML-KEM keygen, encapsulate/decapsulate roundtrip, hybrid KDF, and AES roundtrip tests
- `src/swapchat.test.ts` — updated token length constants
- `jest.config.js` — added babel transform for ESM @noble packages
- `babel.config.js` — new, needed for jest to transform @noble ESM imports
- `package.json` — added @noble/post-quantum, @noble/hashes

### Test results

15/15 tests pass (9 crypto, 2 swarm, 4 swapchat).

---

## 0.2.0 — Modernise Engine

Branch: `chore/modernise-engine`

### What changed

- Node 20 → 22 (`.nvmrc` added)
- bee-js 3 → 12 (unified API, `BeeDebug` removed, `createPostageBatch` on `Bee`)
- TypeScript 4.4 → 6.0, Jest 27 → 30, Webpack 5.65 → 5.106
- Removed unused deps: `web3`, `node-webcrypto-ossl`
- SOCs constructed client-side via `makeContentAddressedChunk()` → `toSingleOwnerChunk()`, uploaded via `POST /chunks`
- Fixed pre-existing bug: missing `await` in `setReceiveLoop()` and `setRestoreConversationLoop()` — unhandled 404 rejections caused polling loops to keep running, reading wrong chunks with wrong IVs, producing decryption failures
- Tests configurable via `BEE_API_URL` and `BEE_STAMP_ID` env vars
- `response.payload()` → `response.payload` (bee-js v12 API change)
- `Utils.hexToBytes` replaced with local `hexToBytes` (removed from bee-js v12)

### Files changed

- `src/swarm.ts` — rewritten: removed `BeeDebug`, client-side SOC construction, `Identifier`/`EthAddress` types
- `src/swapchat.ts` — removed `debugURL` param, `hexToBytes` local, `Buffer.from(response.payload.toUint8Array())` for v12 compat, pre-bought stamp support
- `src/swarm.test.ts` — removed `debugURL`, env var support, `response.payload` property
- `src/swapchat.test.ts` — removed `debugURL`, `makeSession()` helper, env var support
- `webpack.config.ts` — `process/browser` alias, `corejs: 3`
- `tsconfig.json` — `moduleResolution: "node10"`, `ignoreDeprecations: "6.0"`, `rootDir`
- `package.json` — all deps updated, removed web3/node-webcrypto-ossl, added `process`

---

## 0.1.1 — Original

The original hand-written implementation. secp256k1 ECDH key exchange, AES-256-CTR encryption, SOC-based messaging on Ethereum Swarm.
