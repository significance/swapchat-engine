import path from "path";
import { ProvidePlugin, Configuration } from "webpack";

const config: Configuration = {
	entry: "./src/index.ts",
	module: {
		rules: [
			{
				test: /\.(ts|js)?$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader",
					options: {
						presets: [
							[
								"@babel/preset-env",
								{
									useBuiltIns: "usage",
								},
							],
							"@babel/preset-typescript",
						],
					},
				},
			},
		],
	},
	resolve: {
		extensions: [".ts", ".js"],
		alias: {
			// replace native `scrypt` module with pure js `js-scrypt`
			scrypt: "js-scrypt",
		},
		fallback: {
			crypto: require.resolve("crypto-browserify"),
			stream: require.resolve("stream-browserify"),
			buffer: require.resolve("buffer"),
		},
	},
	output: {
		path: path.resolve(__dirname, "dist/web"),
		filename: "swapchat_engine.js",
		library: "swapchat_engine",
		// libraryTarget: "var",
		libraryTarget: "umd",
		globalObject: "this",
	},
	plugins: [
		new ProvidePlugin({
			process: "process/browser.js",
			Buffer: ["buffer", "Buffer"],
		}),
	],
};

export default config;
