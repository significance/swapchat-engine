/**
 * Double Ratchet over SOC
 *
 * SOC keys (for addressing SOC[addr, n]) are stable per session.
 * Ratchet keys are embedded in the encrypted message payload and
 * rotate on every send/receive turn, providing:
 *   - Forward secrecy: compromise of current state cannot recover past messages
 *   - Break-in recovery: after a DH ratchet step, attacker loses access
 *
 * Design follows the Signal Double Ratchet (Marlinspike & Perrin, 2016)
 * adapted for SOC's write-once, sequential-index storage model.
 */

import { createECDH } from "crypto";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const KDF_INFO_ROOT = new TextEncoder().encode("swapchat-ratchet-root");
const KDF_INFO_CHAIN = new TextEncoder().encode("swapchat-ratchet-chain");

const DH_PUB_BYTES = 65; // uncompressed secp256k1 public key
const DH_PRIV_BYTES = 32;

export interface RatchetKeyPair {
	privateKey: Buffer;
	publicKey: Buffer;
}

export interface RatchetState {
	// DH ratchet
	dhSend: RatchetKeyPair;       // our current ratchet key pair
	dhRecv: Buffer | null;        // their latest ratchet public key
	rootKey: Buffer;              // root chain key (32 bytes)

	// Symmetric ratchet
	sendChainKey: Buffer;         // sending chain key
	recvChainKey: Buffer | null;  // receiving chain key (null until first DH ratchet)

	// Counters
	sendCount: number;
	recvCount: number;
	prevSendCount: number;        // send count when last DH ratchet happened
}

function generateDHKeyPair(): RatchetKeyPair {
	const curve = createECDH("secp256k1");
	curve.generateKeys();
	return {
		privateKey: curve.getPrivateKey() as Buffer,
		publicKey: curve.getPublicKey() as Buffer,
	};
}

function dh(privateKey: Buffer, publicKey: Buffer): Buffer {
	const curve = createECDH("secp256k1");
	curve.setPrivateKey(privateKey);
	return curve.computeSecret(publicKey) as Buffer;
}

/**
 * KDF_RK: root key ratchet step
 * Input: root key + DH output
 * Output: new root key + new chain key
 */
function kdfRK(rootKey: Buffer, dhOut: Buffer): { rootKey: Buffer; chainKey: Buffer } {
	const ikm = Buffer.concat([rootKey, dhOut]);
	const derived = Buffer.from(hkdf(sha256, ikm, undefined, KDF_INFO_ROOT, 64));
	return {
		rootKey: derived.subarray(0, 32) as Buffer,
		chainKey: derived.subarray(32, 64) as Buffer,
	};
}

/**
 * KDF_CK: chain key ratchet step
 * Input: chain key
 * Output: new chain key + message key
 */
function kdfCK(chainKey: Buffer): { chainKey: Buffer; messageKey: Buffer } {
	const derived = Buffer.from(hkdf(sha256, chainKey, undefined, KDF_INFO_CHAIN, 64));
	return {
		chainKey: derived.subarray(0, 32) as Buffer,
		messageKey: derived.subarray(32, 64) as Buffer,
	};
}

/**
 * Initialise ratchet state for the initiator.
 * Called after the handshake completes and SharedSecret is established.
 */
export function initRatchetInitiator(sharedSecret: Buffer, theirPub: Buffer): RatchetState {
	const dhSend = generateDHKeyPair();
	const dhOut = dh(dhSend.privateKey, theirPub);
	const { rootKey, chainKey } = kdfRK(sharedSecret, dhOut);

	return {
		dhSend,
		dhRecv: theirPub,
		rootKey,
		sendChainKey: chainKey,
		recvChainKey: null,
		sendCount: 0,
		recvCount: 0,
		prevSendCount: 0,
	};
}

/**
 * Initialise ratchet state for the respondent.
 */
export function initRatchetRespondent(sharedSecret: Buffer, dhKeyPair: RatchetKeyPair): RatchetState {
	return {
		dhSend: dhKeyPair,
		dhRecv: null,
		rootKey: sharedSecret,
		sendChainKey: Buffer.alloc(0),
		recvChainKey: null,
		sendCount: 0,
		recvCount: 0,
		prevSendCount: 0,
	};
}

/**
 * Encrypt: advance the sending chain, return message key + DH header.
 */
export function ratchetEncrypt(
	state: RatchetState,
): { messageKey: Buffer; header: Buffer } {
	const { chainKey, messageKey } = kdfCK(state.sendChainKey);
	state.sendChainKey = chainKey;

	const header = Buffer.from(state.dhSend.publicKey);
	state.sendCount++;

	return { messageKey, header };
}

/**
 * Perform DH ratchet step when we receive a new public key.
 */
function dhRatchetStep(state: RatchetState, theirPub: Buffer): void {
	state.prevSendCount = state.sendCount;
	state.sendCount = 0;
	state.recvCount = 0;
	state.dhRecv = theirPub;

	const dhOut1 = dh(state.dhSend.privateKey, theirPub);
	const rk1 = kdfRK(state.rootKey, dhOut1);
	state.rootKey = rk1.rootKey;
	state.recvChainKey = rk1.chainKey;

	state.dhSend = generateDHKeyPair();
	const dhOut2 = dh(state.dhSend.privateKey, theirPub);
	const rk2 = kdfRK(state.rootKey, dhOut2);
	state.rootKey = rk2.rootKey;
	state.sendChainKey = rk2.chainKey;
}

/**
 * Decrypt: if new DH key, ratchet. Then advance receiving chain.
 */
export function ratchetDecrypt(
	state: RatchetState,
	header: Buffer,
): { messageKey: Buffer } {
	const theirPub = header.subarray(0, DH_PUB_BYTES);

	if (state.dhRecv === null || !theirPub.equals(state.dhRecv)) {
		dhRatchetStep(state, theirPub as Buffer);
	}

	if (state.recvChainKey === null) {
		throw new Error("receiving chain not initialised");
	}

	const { chainKey, messageKey } = kdfCK(state.recvChainKey);
	state.recvChainKey = chainKey;
	state.recvCount++;

	return { messageKey };
}

/**
 * Serialise ratchet state to a compact binary buffer.
 *
 * Layout:
 *   dhSend.privateKey  (32)
 *   dhSend.publicKey   (65)
 *   dhRecvPresent      (1)   0x00 or 0x01
 *   dhRecv             (65)  only if present
 *   rootKey            (32)
 *   sendChainKey       (32)
 *   recvChainPresent   (1)   0x00 or 0x01
 *   recvChainKey       (32)  only if present
 *   sendCount          (4)   uint32 BE
 *   recvCount          (4)   uint32 BE
 *   prevSendCount      (4)   uint32 BE
 */
export function serializeRatchetState(state: RatchetState): Buffer {
	const parts: Buffer[] = [];

	parts.push(Buffer.from(state.dhSend.privateKey));
	parts.push(Buffer.from(state.dhSend.publicKey));

	if (state.dhRecv) {
		parts.push(Buffer.from([0x01]));
		parts.push(Buffer.from(state.dhRecv));
	} else {
		parts.push(Buffer.from([0x00]));
	}

	parts.push(Buffer.from(state.rootKey));
	parts.push(Buffer.from(state.sendChainKey));

	if (state.recvChainKey) {
		parts.push(Buffer.from([0x01]));
		parts.push(Buffer.from(state.recvChainKey));
	} else {
		parts.push(Buffer.from([0x00]));
	}

	const counters = Buffer.alloc(12);
	counters.writeUInt32BE(state.sendCount, 0);
	counters.writeUInt32BE(state.recvCount, 4);
	counters.writeUInt32BE(state.prevSendCount, 8);
	parts.push(counters);

	return Buffer.concat(parts);
}

/**
 * Deserialise ratchet state from binary buffer.
 */
export function deserializeRatchetState(buf: Buffer): RatchetState {
	let offset = 0;

	const dhPriv = buf.subarray(offset, offset + DH_PRIV_BYTES) as Buffer;
	offset += DH_PRIV_BYTES;
	const dhPub = buf.subarray(offset, offset + DH_PUB_BYTES) as Buffer;
	offset += DH_PUB_BYTES;

	const dhRecvPresent = buf[offset++];
	let dhRecv: Buffer | null = null;
	if (dhRecvPresent === 0x01) {
		dhRecv = buf.subarray(offset, offset + DH_PUB_BYTES) as Buffer;
		offset += DH_PUB_BYTES;
	}

	const rootKey = buf.subarray(offset, offset + 32) as Buffer;
	offset += 32;
	const sendChainKey = buf.subarray(offset, offset + 32) as Buffer;
	offset += 32;

	const recvChainPresent = buf[offset++];
	let recvChainKey: Buffer | null = null;
	if (recvChainPresent === 0x01) {
		recvChainKey = buf.subarray(offset, offset + 32) as Buffer;
		offset += 32;
	}

	const sendCount = buf.readUInt32BE(offset);
	offset += 4;
	const recvCount = buf.readUInt32BE(offset);
	offset += 4;
	const prevSendCount = buf.readUInt32BE(offset);

	return {
		dhSend: { privateKey: dhPriv, publicKey: dhPub },
		dhRecv,
		rootKey,
		sendChainKey,
		recvChainKey,
		sendCount,
		recvCount,
		prevSendCount,
	};
}

export { DH_PUB_BYTES, generateDHKeyPair };
