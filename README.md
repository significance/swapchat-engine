### Swapchat Engine

Decentralized E2E encrypted chat on Ethereum Swarm using Single Owner Chunks (SOCs).

Implementing [swapchat protocol pre-release 1.0](./swapchat-protocol.txt) (credits @agazo & @nolash)

SOCs are constructed and signed client-side in JavaScript, then uploaded as raw chunks via `POST /chunks`. No dependency on the bee node's signer.

### Cryptography

- **Key exchange**: Hybrid ML-KEM-768 + secp256k1 ECDH (post-quantum + classical)
- **Message encryption**: AES-256-CTR with message index as IV
- **Hashing**: Keccak-256 (via js-sha3)
- **KDF**: HKDF-SHA256 to combine ECDH and ML-KEM shared secrets
- **SOC signing**: secp256k1 ECDSA (via bee-js / cafe-utility)

ML-KEM is purely lattice-based (FIPS 203). The hybrid approach combines both at the protocol level — if either primitive is broken, the other still protects.

### Protocol

```mermaid
sequenceDiagram
    participant Alice
    participant Swarm
    participant Bob

    Note over Alice: Generate SharedKeyPair E (secp256k1)<br/>Generate OwnKeyPair A (secp256k1)<br/>Generate ML-KEM keypair (encapKey, decapKey)

    Alice->>Bob: Share token out-of-band<br/>(E.priv + A.pub + ML-KEM encapKey)

    Note over Bob: Generate OwnKeyPair B (secp256k1)<br/>ecdhSecret = ECDH(B.priv, A.pub)<br/>(ct, mlkemSecret) = ML-KEM.encapsulate(encapKey)<br/>secret = HKDF(ecdhSecret ‖ mlkemSecret)

    Bob->>Swarm: Write SOC at E.address index 0<br/>(payload: B.pub + ML-KEM ciphertext)

    loop Poll for handshake
        Alice->>Swarm: Read SOC at E.address index 0
    end

    Swarm-->>Alice: B.pub + ciphertext

    Note over Alice: ecdhSecret = ECDH(A.priv, B.pub)<br/>mlkemSecret = ML-KEM.decapsulate(decapKey, ct)<br/>secret = HKDF(ecdhSecret ‖ mlkemSecret)

    Alice->>Swarm: Write SOC at E.address index 1<br/>(payload: ACK)

    loop Poll for ACK
        Bob->>Swarm: Read SOC at E.address index 1
    end

    Swarm-->>Bob: ACK

    Note over Alice,Bob: Both have hybrid shared secret<br/>Messages encrypted with AES-256-CTR

    Alice->>Swarm: Write SOC at A.address index 0<br/>(encrypted message)
    Bob->>Swarm: Write SOC at B.address index 0<br/>(encrypted message)

    loop Poll for messages
        Alice->>Swarm: Read SOC at B.address index N
        Bob->>Swarm: Read SOC at A.address index N
    end
```

### Setup

```
nvm use
npm install
```

### Running tests

Requires a running Bee node.

```
BEE_API_URL=http://localhost:1633 \
BEE_STAMP_ID=<your-stamp-id> \
npx jest --forceExit
```

Environment variables:
- `BEE_API_URL` — Bee node API URL (default: `http://localhost:1633`)
- `BEE_STAMP_ID` — Pre-bought postage stamp batch ID (skips buying a new stamp per test run)

### Build

```
npm run build   # TypeScript → dist/tsc/
npm run pack    # Webpack bundle → dist/web/swapchat_engine.js
```
