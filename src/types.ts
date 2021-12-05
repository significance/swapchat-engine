//utils

export interface Bytes<Length extends number> extends Uint8Array {
	readonly length: Length;
}

// crypto;

export interface Address extends Buffer {}

export interface PublicKey extends Buffer {}

export interface PrivateKey extends Buffer {}

export interface Secret extends Buffer {}

export interface Nonce extends number {}

export interface IV extends Buffer {}

export interface KeyPair {
	address: Address;
	privateKey: PrivateKey;
	publicKey: PublicKey;
}

// swarm
