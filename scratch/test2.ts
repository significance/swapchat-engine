// interface Bytes<Length extends number> extends Uint8Array {
// 	readonly length: Length;
// }

// const test2 = (arg): Bytes<32> => {
// 	return arg;
// };

// console.log(test2(new Uint8Array(33)).length);

interface KeyPair {
	PrivateKey: string;
	PublicKey: string;
}

function test2(kp): KeyPair {
	return kp;
}

let pl3 = test2({ PrivateKey: "test", PublicKey: "test2", Something: "else" });

console.log(pl3.Something);
