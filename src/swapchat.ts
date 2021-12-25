import Swarm from "./swarm";
import crypto from "./crypto";

import { Utils } from "@ethersphere/bee-js";

import {
	KeyPair,
	Secret,
	Address,
	PublicKey,
	PrivateKey,
	Message,
	Conversation,
} from "./types";

const RECEIVE_POLL_MILLISECONDS = 2000;
const PUBLIC_KEY_LENGTH = 130;
const PRIVATE_KEY_LENGTH = 64;

const sleep = (delay: number) =>
	new Promise((resolve) => setTimeout(resolve, delay));

class SwapChat {
	public Swarm: any;
	public SharedKeyPair: undefined | KeyPair;
	public OwnKeyPair: undefined | KeyPair;
	public SharedSecret: undefined | Secret;
	public IsInitiator: boolean = false;
	public IsRespondent: boolean = false;
	public IsPollingForMessages: boolean = false;
	public OtherPartyPublicKey: undefined | PublicKey;
	public OtherPartyAddress: undefined | Address;
	public OwnCurrentIndex: number = 0;
	public OtherPartyCurrentIndex: number = 0;
	public OwnConversation: Conversation;
	public OtherPartyConversation: Conversation;
	public DidReceiveCallback: object;

	constructor(apiURL: string, debugURL: string, didReceiveCallback: object) {
		this.Swarm = new Swarm(apiURL, debugURL);
		this.DidReceiveCallback = didReceiveCallback;
		this.SharedSecret = undefined;
		this.OtherPartyConversation = this.initialiseOtherPartyConversation();
		this.OwnConversation = this.initialiseOwnConversation();
	}

	async initiate() {
		this.IsInitiator = true;
		this.SharedKeyPair = crypto.generateKeyPair();
		this.OwnKeyPair = crypto.generateKeyPair();

		await this.Swarm.buyStamp();
		return this;
	}

	getToken() {
		if (this.SharedKeyPair === undefined || this.OwnKeyPair === undefined) {
			throw new Error("Could not find key pairs");
		}

		const privateKeyHex = this.SharedKeyPair.privateKey.toString("hex");
		const publicKeyHex = this.OwnKeyPair.publicKey.toString("hex");

		if (privateKeyHex.length !== PRIVATE_KEY_LENGTH) {
			throw new Error(
				`privateKeyHex must be ${PRIVATE_KEY_LENGTH} characters long, is ${privateKeyHex.length}`
			);
		}

		if (publicKeyHex.length !== PUBLIC_KEY_LENGTH) {
			throw new Error(
				`publicKeyHex must be ${PUBLIC_KEY_LENGTH} characters long`
			);
		}

		return privateKeyHex + publicKeyHex;
	}

	async respond(token: string) {
		this.IsRespondent = true;
		this.OwnKeyPair = crypto.generateKeyPair();
		this.parseToken(token);

		await this.Swarm.buyStamp();

		await this.sendRespondentHandshakeChunk();

		return this;
	}

	parseToken(token: string): void {
		if (token.length !== PRIVATE_KEY_LENGTH + PUBLIC_KEY_LENGTH) {
			throw new Error(
				`token must be ${
					PRIVATE_KEY_LENGTH + PUBLIC_KEY_LENGTH
				} characters long`
			);
		}

		const sharedPrivateKeyHex = token.substr(0, PRIVATE_KEY_LENGTH);
		const respondentPublicKeyHex = token.substr(
			PRIVATE_KEY_LENGTH,
			PRIVATE_KEY_LENGTH + PUBLIC_KEY_LENGTH
		);

		const sharedPrivateKey = Utils.hexToBytes(
			sharedPrivateKeyHex
		) as PrivateKey;

		const respondentPublicKey = Utils.hexToBytes(
			respondentPublicKeyHex
		) as PublicKey;

		this.OtherPartyPublicKey = respondentPublicKey;

		const OtherPartyAddressBytes = crypto.publicKeyToAddress(
			respondentPublicKey
		) as Address;

		this.OtherPartyAddress = OtherPartyAddressBytes;

		this.SharedKeyPair = crypto.importKeyPair(sharedPrivateKey) as KeyPair;

		if (this.OwnKeyPair === undefined) {
			throw new Error("could not find own key pair");
		}

		this.SharedSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKey
		);
	}

	getRespondentHandshakePayload(): PublicKey {
		// todo encrypt this using something from token?
		if (this.OwnKeyPair === undefined) {
			throw new Error("Could not find publickey");
		}
		return this.OwnKeyPair.publicKey;
	}

	async sendRespondentHandshakeChunk() {
		const payload = this.getRespondentHandshakePayload();
		await this.Swarm.writeSOC(this.SharedKeyPair, 0, payload);
	}

	async waitForRespondentHandshakeChunk(): Promise<void> {
		if (this.SharedKeyPair === undefined) {
			throw new Error("Could not find sharedKeyPair");
		}

		let response;
		try {
			response = await this.Swarm.readSOC(this.SharedKeyPair.address, 0);
		} catch (e) {
			throw new Error("could not find respondent handshake chunk");
		}

		//todo, timeout after a while
		if (response === undefined) {
			console.log("trying to find respondent handshake chunk");
			await sleep(1000);
			return await this.waitForRespondentHandshakeChunk();
		}

		await this.sendInitiatorHandshakeChunk();

		this.parseRespondentHandshakePayload(response.payload());

		this.IsPollingForMessages = true;
		this.setReceiveLoop();

		return;
	}

	getInitiatorHandshakePayload(): Uint8Array {
		// todo encrypt this using something from token?
		return new Uint8Array([1]);
	}

	async sendInitiatorHandshakeChunk() {
		const payload = this.getInitiatorHandshakePayload();
		await this.Swarm.writeSOC(this.SharedKeyPair, 1, payload);
	}

	async waitForInitiatorHandshakeChunk(): Promise<void> {
		if (this.SharedKeyPair === undefined) {
			throw new Error("could not find shared key pair");
		}
		let response;
		try {
			response = await this.Swarm.readSOC(this.SharedKeyPair.address, 1);
		} catch (e) {
			throw new Error("could not find initiator handshake chunk");
		}

		//todo, timeout after a while
		if (response === undefined) {
			console.log("trying to find initiator handshake chunk");
			await sleep(1000);
			return await this.waitForInitiatorHandshakeChunk();
		}

		this.IsPollingForMessages = true;
		this.setReceiveLoop();

		return;
	}

	parseRespondentHandshakePayload(respondentPublicKey: PublicKey) {
		if (this.OwnKeyPair === undefined) {
			throw new Error("could not find own key pair");
		}

		this.SharedSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKey
		);

		this.OtherPartyPublicKey = respondentPublicKey;

		if (this.OtherPartyPublicKey === undefined) {
			throw new Error("could not find other party public key");
		}

		this.OtherPartyAddress = crypto.publicKeyToAddress(respondentPublicKey);
	}

	handShakeCompleted(): boolean {
		if (
			typeof this.SharedKeyPair !== undefined &&
			typeof this.OwnKeyPair !== undefined &&
			typeof this.SharedSecret !== undefined
		) {
			return true;
		} else {
			return false;
		}
	}

	serialiseMessage(index: number, messageContent: string): Message {
		return {
			index: index,
			content: messageContent,
			timestamp: Date.now(),
		};
	}

	async encryptPayload(
		message: Message,
		secret: Secret,
		iv: number
	): Promise<Buffer> {
		const ivBuffer = crypto.ivFromUint(iv);
		const payloadString = JSON.stringify(message);
		const payloadBuffer = Buffer.from(payloadString, "utf-8");

		const encryptedBuffer = await crypto.encryptBuffer(
			payloadBuffer,
			secret,
			ivBuffer
		);

		//todo check less than 4096kb
		return encryptedBuffer;
	}

	async send(messageContent: string): Promise<boolean> {
		const message = this.serialiseMessage(
			this.OwnCurrentIndex,
			messageContent
		);

		if (this.SharedSecret === undefined) {
			throw new Error("could not find shared secret");
		}

		const payload = await this.encryptPayload(
			message,
			this.SharedSecret,
			this.OwnCurrentIndex
		);

		await this.Swarm.writeSOC(
			this.OwnKeyPair,
			this.OwnCurrentIndex,
			new Uint8Array(payload)
		);
		this.OwnCurrentIndex = this.OwnCurrentIndex + 1;
		return true;
	}

	deserialiseMessage(message: Message): Message {
		return {
			index: message.index,
			content: message.content,
			timestamp: message.timestamp,
		};
	}

	decryptPayload(payloadBuffer: Buffer, secret: Secret, iv: number): Message {
		const ivBuffer = crypto.ivFromUint(iv);
		const decryptedBuffer = crypto.decryptBuffer(
			payloadBuffer,
			secret,
			ivBuffer
		);
		const payloadString = decryptedBuffer.toString("utf-8");
		const message = JSON.parse(payloadString);
		return message;
	}

	setReceiveLoop() {
		setTimeout(async () => {
			if (this.IsPollingForMessages === false) {
				return;
			}
			try {
				this.receive();
			} catch (e) {
				return;
			}
			this.setReceiveLoop();
		}, RECEIVE_POLL_MILLISECONDS);
	}

	async receive(): Promise<boolean> {
		let response;
		try {
			response = await this.Swarm.readSOC(
				this.OtherPartyAddress,
				this.OtherPartyCurrentIndex
			);
		} catch (e) {
			console.log(
				`could not find chunk at index ${this.OtherPartyCurrentIndex} with error ${e}`
			);
			return false;
		}

		if (this.SharedSecret === undefined) {
			throw new Error("could not find shared secret");
		}

		const payload = this.decryptPayload(
			response.payload(),
			this.SharedSecret,
			this.OtherPartyCurrentIndex
		);

		const message = this.deserialiseMessage(payload);

		this.OtherPartyCurrentIndex = this.OtherPartyCurrentIndex + 1;

		this.OtherPartyConversation.messages.push(message);

		console.log("received", message);
		// this.DidReceiveCallback(message);
		return true;
	}

	initialiseOwnConversation(): Conversation {
		return {
			messages: [],
		};
	}

	initialiseOtherPartyConversation(): Conversation {
		return {
			messages: [],
		};
	}

	addToConversation(
		conversation: Conversation,
		message: Message,
		index: number
	): void {
		if (conversation.messages[index] === undefined) {
			conversation.messages[index] = message;
		} else {
			throw new Error(`message with index ${index} already exists`);
		}
		return;
	}

	close() {
		this.IsPollingForMessages = false;
	}
}

export default SwapChat;
