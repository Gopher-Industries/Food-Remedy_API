const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Ensure Metro treats .wasm files as assets so imports like './wa-sqlite.wasm' resolve.
config.resolver = config.resolver || {};
config.resolver.assetExts = Array.isArray(config.resolver.assetExts)
	? [...config.resolver.assetExts, 'wasm']
	: ['wasm'];

module.exports = withNativeWind(config, { input: './global.css' });