import { KeyPair, PublicKey, PrivateKey, Secret, IV } from "./types";

import { createECDH, createCipheriv, createDecipheriv } from "crypto";

class Crypto {
	generateKeyPair(): KeyPair {
		const curve = createECDH("secp256k1");
		curve.generateKeys();
		return {
			privateKey: curve.getPrivateKey(),
			publicKey: curve.getPublicKey(),
		};
	}

	calculateSharedSecret(
		privateKey: PrivateKey,
		publicKey: PublicKey
	): Secret {
		let sender = createECDH("secp256k1");
		sender.setPrivateKey(privateKey);

		return sender.computeSecret(publicKey);
	}

	// async encryptString(plainText: string, secret: Secret, iv: Nonce): string {
	// 	return this.encryptBuffer(
	// 		Buffer.from(string, "utf8"),
	// 		password,
	// 		iv
	// 	).then((encryptedBuffer) => {
	// 		return encryptedBuffer.toString("hex");
	// 	});
	// }

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

	// decryptString(string, password, iv) {
	// 	let decryptedBuffer = this.decryptBuffer(
	// 		Buffer.from(string, "hex"),
	// 		password,
	// 		iv
	// 	);
	// 	return new TextDecoder().decode(decryptedBuffer);
	// }

	decryptBuffer(cypherTextBuffer: Buffer, secret: Secret, iv: IV) {
		var decipher = createDecipheriv("aes-256-ctr", secret, iv);
		var dec = Buffer.concat([
			decipher.update(cypherTextBuffer),
			decipher.final(),
		]);
		return dec;
	}
}

export default new Crypto();
