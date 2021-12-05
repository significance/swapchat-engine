import Swarm from "./swarm";
import crypto from "./crypto";

import { Utils } from "@ethersphere/bee-js";

import { KeyPair, PublicKey, PrivateKey } from "./types";

class SwapChat {
	public Swarm: any;
	public SharedKeyPair: any;
	public OwnKeyPair: any;
	public SharedSecret: any;
	public IsInitiator: boolean = false;
	public IsRespondent: boolean = false;

	initiate(apiURL: string, debugURL: string) {
		this.IsInitiator = true;
		this.SharedKeyPair = crypto.generateKeyPair();
		this.OwnKeyPair = crypto.generateKeyPair();
		this.Swarm = new Swarm(apiURL, debugURL);
		return this;
	}

	respond(apiURL: string, debugURL: string, token: string) {
		this.IsRespondent = true;
		this.OwnKeyPair = crypto.generateKeyPair();
		this.Swarm = new Swarm(apiURL, debugURL);
		this.parseToken(token);
		return this;
	}

	getToken() {
		return (
			this.SharedKeyPair.privateKey.toString("hex") +
			this.OwnKeyPair.publicKey.toString("hex")
		);
	}

	parseResponsePayload(responsePayload: string) {
		let respondentPublicKey = responsePayload;
		let respondentPublicKeyBytes = Utils.hexToBytes(
			respondentPublicKey
		) as PublicKey;
		this.SharedSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKeyBytes
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

	getResponsePayload(): string {
		// todo encrypt this using something from token?
		return this.OwnKeyPair.publicKey.toString("hex");
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
