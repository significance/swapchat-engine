import { KeyPair, PublicKey, PrivateKey, Secret, IV } from "./types";

import { keccak256Hash } from "./utils";

import { createECDH, createCipheriv, createDecipheriv } from "crypto";

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
}

export default new Crypto();
