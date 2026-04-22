//utils

export interface Bytes<Length extends number> extends Uint8Array {
	readonly length: Length;
}

// crypto;

export interface Address extends Buffer {}

export interface PublicKey extends Buffer {}

export interface PrivateKey extends Buffer {}

export interface Secret extends Buffer {}

export interface SecretCode extends Buffer {}

export interface IV extends Buffer {}

export interface KeyPair {
	address: Address;
	privateKey: PrivateKey;
	publicKey: PublicKey;
}

export interface MlKemEncapsulationKey extends Uint8Array {}

export interface MlKemDecapsulationKey extends Uint8Array {}

export interface MlKemCiphertext extends Uint8Array {}

export interface MlKemKeyPair {
	encapsulationKey: MlKemEncapsulationKey;
	decapsulationKey: MlKemDecapsulationKey;
}

// swarm

export type SwarmType<T> = new (...args: any[]) => T;

export interface Message {
	index: number;
	content: string;
	timestamp: number;
}

export interface Conversation {
	messages: Message[];
}
