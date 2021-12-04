// interface Bytes<Length extends number> extends Uint8Array {
// 	readonly length: Length;
// }
function test2(kp) {
    return kp;
}
var pl3 = test2({ PrivateKey: "test", PublicKey: "test2", Something: "else" });
console.log(pl3.Something);
