// const identity = (x: Array<1>): Array<1> => {
// 	return [x];
// };

// console.log(Typof identity);

// console.log(identity(2));

// function identity<Typ>(x: Typ): Typ {
// 	return x;
// }

// function loggingIdentity<Typ>(arg: Typ): Typ {
// 	return arg;
// }

function loggingIdentity<Typ>(arg: Typ[]): Typ[] {
	console.log(arg.length);
	return arg;
}

let output = loggingIdentity([2]);

console.log(output);
