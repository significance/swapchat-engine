import { Bee, BeeDebug, Utils } from "@ethersphere/bee-js";

import { Bytes, KeyPair } from "./types";

// import { makeBytes } from "./utils";

const SOC_READ_TIMEOUT = 1000;

class Swarm {
	public Bee;
	public BeeDebug;
	public KeyPair: KeyPair | undefined;
	public BatchID: any;

	constructor(apiURL: string, debugURL: string) {
		this.Bee = new Bee(apiURL);
		this.BeeDebug = new BeeDebug(debugURL);
	}

	async useStamp(postageBatchId: string) {
		this.BatchID = postageBatchId;

		return this.BatchID;
	}

	async buyStamp() {
		const postageBatchId = await this.BeeDebug.createPostageBatch(
			"100",
			17
		);
		this.BatchID = postageBatchId;

		return this.BatchID;
	}

	zeroStamp() {
		this.BatchID =
			"0000000000000000000000000000000000000000000000000000000000000000";

		return this.BatchID;
	}

	async writeSOC(keyPair: KeyPair, index: number, data: any) {
		const topic = Buffer.alloc(32);
		topic.writeUInt16LE(index, 0);

		if (keyPair === undefined) {
			throw new Error("can only write if keypair was defined");
		}

		let socWriter = this.Bee.makeSOCWriter(keyPair.privateKey);

		//what is the desired way to deal with this? :D
		type Identifier = Bytes<32>;
		const topicBytes: Identifier = Utils.hexToBytes(topic.toString("hex"));

		return await socWriter.upload(this.BatchID, topicBytes, data);
	}

	async readSOC(address: any, index: number) {
		let socReader = this.Bee.makeSOCReader(address, {
			timeout: SOC_READ_TIMEOUT,
		});

		const topic = Buffer.alloc(32);
		topic.writeUInt16LE(index, 0);

		//what is the desired way to deal with this? :D
		type Identifier = Bytes<32>;
		const topicBytes: Identifier = Utils.hexToBytes(topic.toString("hex"));

		let response = await socReader.download(topicBytes);

		return response;
	}
}

export default Swarm;
