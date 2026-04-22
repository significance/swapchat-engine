### Swapchat Engine

Decentralized E2E encrypted chat on Ethereum Swarm using Single Owner Chunks (SOCs).

Implementing [swapchat protocol pre-release 1.0](./swapchat-protocol.txt) (credits @agazo & @nolash)

SOCs are constructed and signed client-side in JavaScript, then uploaded as raw chunks via `POST /chunks`. No dependency on the bee node's signer.

### Protocol

```mermaid
sequenceDiagram
    participant Alice
    participant Swarm
    participant Bob

    Note over Alice: Generate SharedKeyPair (E)<br/>Generate OwnKeyPair (A)

    Alice->>Bob: Share token out-of-band<br/>(E.privateKey + A.publicKey)

    Note over Bob: Generate OwnKeyPair (B)<br/>Import E from token<br/>SharedSecret = ECDH(B.private, A.public)

    Bob->>Swarm: Write SOC at E.address index 0<br/>(payload: B.publicKey)

    loop Poll for handshake
        Alice->>Swarm: Read SOC at E.address index 0
    end

    Swarm-->>Alice: B.publicKey

    Note over Alice: SharedSecret = ECDH(A.private, B.public)

    Alice->>Swarm: Write SOC at E.address index 1<br/>(payload: ACK)

    loop Poll for ACK
        Bob->>Swarm: Read SOC at E.address index 1
    end

    Swarm-->>Bob: ACK

    Note over Alice,Bob: Both have SharedSecret<br/>Messages encrypted with AES-256-CTR

    Alice->>Swarm: Write SOC at A.address index 0<br/>(encrypted message)
    Bob->>Swarm: Write SOC at B.address index 0<br/>(encrypted message)

    loop Poll for messages
        Alice->>Swarm: Read SOC at B.address index N
        Bob->>Swarm: Read SOC at A.address index N
    end
```

Each message is encrypted with AES-256-CTR using the shared secret and the message index as IV. Messages are stored as SOCs at each party's own address, indexed sequentially.

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
