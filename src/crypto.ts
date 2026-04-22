import {
	KeyPair,
	PublicKey,
	PrivateKey,
	Secret,
	IV,
	MlKemKeyPair,
	MlKemEncapsulationKey,
	MlKemDecapsulationKey,
	MlKemCiphertext,
} from "./types";

import { keccak256Hash } from "./utils";

import { createECDH, createCipheriv, createDecipheriv } from "crypto";

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

class Crypto {
	ivFromUint(int: number) {
		let ivBuffer = Buffer.alloc(16);
		ivBuffer.writeUInt16BE(int, 0);
		return ivBuffer;
	}

	importKeyPair(privateKey: PrivateKey): KeyPair {
		const curve = createECDH("secp256k1");

		curve.setPrivateKey(privateKey);

		let publicKey = curve.getPublicKey();
		let address = this.publicKeyToAddress(publicKey);

		return {
			address: address,
			privateKey: curve.getPrivateKey(),
			publicKey: publicKey,
		};
	}

	generateKeyPair(): KeyPair {
		const curve = createECDH("secp256k1");

		curve.generateKeys();

		let publicKey = curve.getPublicKey();
		let address = this.publicKeyToAddress(publicKey);

		return {
			address: Buffer.from(address),
			privateKey: curve.getPrivateKey(),
			publicKey: publicKey,
		};
	}

	publicKeyToAddress(pubKey: PublicKey) {
		return Buffer.from(keccak256Hash(pubKey.slice(1)).slice(12));
	}

	calculateSharedSecret(
		privateKey: PrivateKey,
		publicKey: PublicKey
	): Secret {
		let sender = createECDH("secp256k1");
		sender.setPrivateKey(privateKey);

		return sender.computeSecret(publicKey);
	}

	calculateSecretCode(sharedSecret: Secret) {
		return Buffer.from(keccak256Hash(sharedSecret));
	}

	async encryptBuffer(
		plainTextBuffer: Buffer,
		secret: Secret,
		ivBuffer: IV
	): Promise<Buffer> {
		return new Promise((resolve) => {
			let cipher = createCipheriv("aes-256-ctr", secret, ivBuffer);
			let crypted = Buffer.concat([
				cipher.update(plainTextBuffer),
				cipher.final(),
			]);
			resolve(crypted);
		});
	}

	decryptBuffer(cypherTextBuffer: Buffer, secret: Secret, ivBuffer: IV) {
		var decipher = createDecipheriv("aes-256-ctr", secret, ivBuffer);
		var dec = Buffer.concat([
			decipher.update(cypherTextBuffer),
			decipher.final(),
		]);
		return dec;
	}

	generateMlKemKeyPair(): MlKemKeyPair {
		const keys = ml_kem768.keygen();
		return {
			encapsulationKey: keys.publicKey as MlKemEncapsulationKey,
			decapsulationKey: keys.secretKey as MlKemDecapsulationKey,
		};
	}

	mlKemEncapsulate(encapsulationKey: MlKemEncapsulationKey): {
		ciphertext: MlKemCiphertext;
		sharedSecret: Uint8Array;
	} {
		const result = ml_kem768.encapsulate(encapsulationKey);
		return {
			ciphertext: result.cipherText as MlKemCiphertext,
			sharedSecret: result.sharedSecret,
		};
	}

	mlKemDecapsulate(
		decapsulationKey: Uint8Array,
		ciphertext: MlKemCiphertext
	): Uint8Array {
		return ml_kem768.decapsulate(ciphertext, decapsulationKey);
	}

	deriveHybridSecret(ecdhSecret: Buffer, mlkemSecret: Uint8Array): Secret {
		const combined = Buffer.concat([ecdhSecret, Buffer.from(mlkemSecret)]);
		const info = new TextEncoder().encode("swapchat-hybrid");
		const derived = hkdf(sha256, combined, undefined, info, 32);
		return Buffer.from(derived) as Secret;
	}
}

export default new Crypto();
