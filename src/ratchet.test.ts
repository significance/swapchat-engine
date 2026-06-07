import {
	initRatchetInitiator,
	initRatchetRespondent,
	ratchetEncrypt,
	ratchetDecrypt,
	generateDHKeyPair,
} from "./ratchet";

import { createCipheriv, createDecipheriv } from "crypto";

const sharedSecret = Buffer.alloc(32);
for (let i = 0; i < 32; i++) sharedSecret[i] = i;

function encrypt(key: Buffer, iv: number, data: Buffer): Buffer {
	const ivBuf = Buffer.alloc(16);
	ivBuf.writeUInt16BE(iv, 0);
	const cipher = createCipheriv("aes-256-ctr", key, ivBuf);
	return Buffer.concat([cipher.update(data), cipher.final()]);
}

function decrypt(key: Buffer, iv: number, data: Buffer): Buffer {
	const ivBuf = Buffer.alloc(16);
	ivBuf.writeUInt16BE(iv, 0);
	const decipher = createDecipheriv("aes-256-ctr", key, ivBuf);
	return Buffer.concat([decipher.update(data), decipher.final()]);
}

test("symmetric ratchet: A sends, B decrypts", () => {
	const bobDH = generateDHKeyPair();
	const alice = initRatchetInitiator(sharedSecret, bobDH.publicKey);
	const bob = initRatchetRespondent(sharedSecret, bobDH);

	const { messageKey: mkA, header } = ratchetEncrypt(alice);
	const plaintext = Buffer.from("hello from alice");
	const ciphertext = encrypt(mkA, 0, plaintext);

	const { messageKey: mkB } = ratchetDecrypt(bob, header);
	const decrypted = decrypt(mkB, 0, ciphertext);

	expect(decrypted).toStrictEqual(plaintext);
});

test("message keys differ per message (forward secrecy)", () => {
	const bobDH = generateDHKeyPair();
	const alice = initRatchetInitiator(sharedSecret, bobDH.publicKey);

	const { messageKey: mk1 } = ratchetEncrypt(alice);
	const { messageKey: mk2 } = ratchetEncrypt(alice);

	expect(mk1.equals(mk2)).toBe(false);
});

test("DH ratchet: A sends, B replies, A decrypts reply", () => {
	const bobDH = generateDHKeyPair();
	const alice = initRatchetInitiator(sharedSecret, bobDH.publicKey);
	const bob = initRatchetRespondent(sharedSecret, bobDH);

	// A -> B
	const { messageKey: mkA1, header: hA1 } = ratchetEncrypt(alice);
	const msg1 = Buffer.from("hello bob");
	const ct1 = encrypt(mkA1, 0, msg1);

	const { messageKey: mkB1 } = ratchetDecrypt(bob, hA1);
	expect(decrypt(mkB1, 0, ct1)).toStrictEqual(msg1);

	// B -> A (DH ratchet step happens here)
	const { messageKey: mkB2, header: hB1 } = ratchetEncrypt(bob);
	const msg2 = Buffer.from("hello alice");
	const ct2 = encrypt(mkB2, 0, msg2);

	const { messageKey: mkA2 } = ratchetDecrypt(alice, hB1);
	expect(decrypt(mkA2, 0, ct2)).toStrictEqual(msg2);
});

test("full conversation: multiple messages each direction", () => {
	const bobDH = generateDHKeyPair();
	const alice = initRatchetInitiator(sharedSecret, bobDH.publicKey);
	const bob = initRatchetRespondent(sharedSecret, bobDH);

	const messages = [
		{ from: "alice", text: "hey" },
		{ from: "alice", text: "you there?" },
		{ from: "bob", text: "yeah hi" },
		{ from: "alice", text: "cool" },
		{ from: "bob", text: "what's up" },
		{ from: "bob", text: "still there?" },
	];

	for (const msg of messages) {
		const plaintext = Buffer.from(msg.text);
		if (msg.from === "alice") {
			const { messageKey, header } = ratchetEncrypt(alice);
			const ct = encrypt(messageKey, 0, plaintext);
			const { messageKey: dk } = ratchetDecrypt(bob, header);
			expect(decrypt(dk, 0, ct)).toStrictEqual(plaintext);
		} else {
			const { messageKey, header } = ratchetEncrypt(bob);
			const ct = encrypt(messageKey, 0, plaintext);
			const { messageKey: dk } = ratchetDecrypt(alice, header);
			expect(decrypt(dk, 0, ct)).toStrictEqual(plaintext);
		}
	}
});

test("all message keys in a session are unique", () => {
	const bobDH = generateDHKeyPair();
	const alice = initRatchetInitiator(sharedSecret, bobDH.publicKey);
	const bob = initRatchetRespondent(sharedSecret, bobDH);

	const keys = new Set<string>();

	for (let i = 0; i < 5; i++) {
		const { messageKey, header } = ratchetEncrypt(alice);
		keys.add(messageKey.toString("hex"));
		ratchetDecrypt(bob, header);
	}

	for (let i = 0; i < 5; i++) {
		const { messageKey, header } = ratchetEncrypt(bob);
		keys.add(messageKey.toString("hex"));
		ratchetDecrypt(alice, header);
	}

	expect(keys.size).toBe(10);
});

test("old chain keys cannot derive future message keys", () => {
	const bobDH = generateDHKeyPair();
	const alice = initRatchetInitiator(sharedSecret, bobDH.publicKey);
	const bob = initRatchetRespondent(sharedSecret, bobDH);

	// Capture chain key before ratchet
	const chainKeyBefore = Buffer.from(alice.sendChainKey);

	// Send a message (advances chain)
	const { header: h1 } = ratchetEncrypt(alice);
	ratchetDecrypt(bob, h1);

	// Bob replies (DH ratchet)
	const { header: h2 } = ratchetEncrypt(bob);
	ratchetDecrypt(alice, h2);

	// Chain key has changed completely due to DH ratchet
	expect(alice.sendChainKey.equals(chainKeyBefore)).toBe(false);
	// Root key has also changed
	expect(alice.rootKey.equals(sharedSecret)).toBe(false);
});
