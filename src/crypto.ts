import {
	randomBytes,
	createECDH,
	createCipheriv,
	createDecipheriv,
} from "crypto";
import { ec } from "elliptic";

class Crypto {
	generatePrivateKey(): <bytes> {
		return randomBytes(32);
	}

	generateRandomIV() {
		return randomBytes(16);
	}

	privateToPublicKey(privateKey) {
		const secp256k1 = new ec("secp256k1");
		const buffer = Buffer.from(privateKey.slice(2), "hex");
		const ecKey = secp256k1.keyFromPrivate(buffer);
		const publicKey = "0x" + ecKey.getPublic(false, "hex").slice(2);
		return publicKey;
	}

	calculateSharedSecret(privateKey, recipientPublicKey) {
		let pk = privateKey.substring(2, 66);
		let pub = recipientPublicKey.substring(2, 130);
		if (pk.length !== 64) {
			throw new Error(
				"private key must be a 32 byte hex string " + privateKey
			);
		}
		if (pub.length !== 128) {
			throw new Error(
				"public key must be a 64 byte hex string " + recipientPublicKey
			);
		}
		let sender = createECDH("secp256k1");
		sender.setPrivateKey(pk, "hex");
		return sender.computeSecret("04" + pub, "hex").toString("hex");
	}

	encryptString(string, password, iv) {
		return this.encryptBuffer(
			Buffer.from(string, "utf8"),
			password,
			iv
		).then((encryptedBuffer) => {
			return encryptedBuffer.toString("hex");
		});
	}

	decryptString(string, password, iv) {
		let decryptedBuffer = this.decryptBuffer(
			Buffer.from(string, "hex"),
			password,
			iv
		);
		return new TextDecoder().decode(decryptedBuffer);
	}

	encryptBuffer(buffer, password, iv) {
		return new Promise((resolve, reject) => {
			let cipher = createCipheriv(
				"aes-256-ctr",
				Buffer.from(password.substring(2), "hex"),
				iv
			);
			let crypted = Buffer.concat([
				cipher.update(buffer),
				cipher.final(),
			]);
			resolve(crypted);
		});
	}

	decryptBuffer(buffer, password, iv) {
		var decipher = createDecipheriv(
			"aes-256-ctr",
			Buffer.from(password.substring(2), "hex"),
			iv
		);
		var dec = Buffer.concat([decipher.update(buffer), decipher.final()]);
		return dec;
	}
}

export default new Crypto();
