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

### Book of Stamps (Zero-BZZ Respondent)

The initiator can sponsor the respondent so they need zero BZZ or xDAI to chat. During the handshake, the initiator pre-signs postage stamps for all SOC addresses the respondent will use and sends them as an encrypted "book of stamps".

```mermaid
sequenceDiagram
    participant Alice
    participant Swarm
    participant Bob

    Note over Alice: Buy stamp batch on Gnosis Chain<br/>Generate keys + ML-KEM keypair<br/>Pre-stamp handshake SOC address

    Alice->>Bob: Token (keys + ML-KEM encapKey + handshake stamp)

    Note over Bob: No BZZ needed!<br/>Use handshake stamp from token

    Bob->>Swarm: Write handshake SOC<br/>(using pre-signed stamp)

    Swarm-->>Alice: Handshake payload

    Note over Alice: Derive shared secret<br/>Pre-stamp 36 SOC addresses for Bob<br/>Encrypt book with shared secret

    Alice->>Swarm: Write book of stamps SOC<br/>(36 encrypted pre-signed stamps)

    Alice->>Swarm: Write ACK SOC

    Swarm-->>Bob: ACK

    Note over Bob: Read + decrypt book of stamps<br/>Now has 36 pre-paid message slots

    Bob->>Swarm: Send message using stamp[0]
    Bob->>Swarm: Send message using stamp[1]
    Note over Bob: ...up to 36 messages
```

### Stamping

Three modes:

**Server-side stamping** (default): pass a batch ID and the bee node signs the stamp.

**Client-side stamping**: set `SignerKey` and `BatchID` on the initiator. Stamps chunks locally in JavaScript.

**Book of stamps** (zero-BZZ respondent): when the initiator uses client-side stamping, they automatically create a book of stamps for the respondent. The respondent needs nothing — stamps come from the token (handshake) and book (messages).

To buy a stamp for client-side use, fund an address with BZZ + xDAI on Gnosis Chain, then:

```
BEE_SIGNER_KEY=<hex-private-key> ./scripts/buy-stamp.sh
```

This calls the [PostageStamp contract](https://github.com/ethersphere/storage-incentives) via `cast` (Foundry).

### Running tests

Requires a running Bee node.

```bash
# Server-side stamping only
BEE_API_URL=http://localhost:1633 \
BEE_STAMP_ID=<node-owned-stamp> \
npx jest --forceExit

# With client-side stamping tests
BEE_API_URL=http://localhost:1633 \
BEE_STAMP_ID=<node-owned-stamp> \
BEE_SIGNER_KEY=<hex-private-key> \
BEE_CLIENT_STAMP_ID=<signer-owned-stamp> \
BEE_STAMP_DEPTH=20 \
npx jest --forceExit
```

Environment variables:
- `BEE_API_URL` — Bee node API URL (default: `http://localhost:1633`)
- `BEE_STAMP_ID` — Node-owned stamp batch ID (server-side stamping)
- `BEE_SIGNER_KEY` — Hex private key of the batch owner (client-side stamping)
- `BEE_CLIENT_STAMP_ID` — Signer-owned stamp batch ID (client-side stamping)
- `BEE_STAMP_DEPTH` — Batch depth (default: `20`)

### Build

```
npm run build   # TypeScript → dist/tsc/
npm run pack    # Webpack bundle → dist/web/swapchat_engine.js
```
