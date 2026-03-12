const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  // Ensure WebAssembly files are treated as resources and enable async WebAssembly.
  // Add .wasm to resolver extensions so imports like './wa-sqlite.wasm' resolve.
  config.resolve = config.resolve || {};
  config.resolve.extensions = Array.isArray(config.resolve.extensions)
    ? [...config.resolve.extensions, '.wasm']
    : ['.wasm'];

  // Add a rule to emit wasm files as resources (file assets).
  config.module = config.module || {};
  config.module.rules = config.module.rules || [];
  config.module.rules.unshift({
    test: /\\.wasm$/,
    type: 'asset/resource',
    generator: {
      filename: 'static/wasm/[name].[hash][ext]'
    }
  });

  config.experiments = config.experiments || {};
  config.experiments.asyncWebAssembly = true;
  return config;
};
