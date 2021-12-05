import Swarm from "./swarm";
import crypto from "./crypto";

import { Utils } from "@ethersphere/bee-js";

import { KeyPair, PublicKey, PrivateKey } from "./types";

const sleep = (delay: any) =>
	new Promise((resolve) => setTimeout(resolve, delay));

class SwapChat {
	public Swarm: any;
	public SharedKeyPair: any;
	public OwnKeyPair: any;
	public SharedSecret: any;
	public IsInitiator: boolean = false;
	public IsRespondent: boolean = false;

	async initiate(apiURL: string, debugURL: string) {
		this.IsInitiator = true;
		this.SharedKeyPair = crypto.generateKeyPair();
		this.OwnKeyPair = crypto.generateKeyPair();

		this.Swarm = new Swarm(apiURL, debugURL);
		await this.Swarm.buyStamp();

		return this;
	}

	async respond(apiURL: string, debugURL: string, token: string) {
		this.IsRespondent = true;
		this.OwnKeyPair = crypto.generateKeyPair();
		this.parseToken(token);

		this.Swarm = new Swarm(apiURL, debugURL);
		await this.Swarm.buyStamp();

		await this.sendRespondentHandshakeChunk();

		return this;
	}

	getToken() {
		return (
			this.SharedKeyPair.privateKey.toString("hex") +
			this.OwnKeyPair.publicKey.toString("hex")
		);
	}

	getRespondentHandshakePayload(): any {
		// todo encrypt this using something from token?
		return this.OwnKeyPair.publicKey;
	}

	async sendRespondentHandshakeChunk() {
		let payload = this.getRespondentHandshakePayload();
		await this.Swarm.writeSOC(this.SharedKeyPair, 0, payload);
	}

	async waitForRespondentHandshakeChunk() {
		let response = await this.Swarm.readSOC(this.SharedKeyPair.address, 0);
		if (response.length == 65) {
		} else {
			console.log(response.length);
			await sleep(1000);
			this.waitForRespondentHandshakeChunk();
		}
	}

	async waitForInitiatorHandshakeChunk() {
		let response;
		try {
			response = await this.Swarm.readSOC(this.SharedKeyPair.address, 1);
			return true;
		} catch (e) {
			console.log(response);
			if (response.status === 404) {
				await sleep(1000);
				return await this.waitForRespondentHandshakeChunk();
			}
		}
	}

	parseRespondentHandshakePayload(respondentPublicKey: PublicKey) {
		this.SharedSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKey
		);
	}

	parseToken(token: string) {
		let sharedPrivateKey = token.substr(0, 64);
		let respondentPublicKey = token.substr(64, 194);

		let sharedPrivateKeyBytes = Utils.hexToBytes(
			sharedPrivateKey
		) as PrivateKey;

		let respondentPublicKeyBytes = Utils.hexToBytes(
			respondentPublicKey
		) as PublicKey;

		this.SharedKeyPair = crypto.importKeyPair(
			sharedPrivateKeyBytes
		) as KeyPair;

		this.SharedSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKeyBytes
		);
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
}

export default new SwapChat();
