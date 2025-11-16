// Webpack compatibility wrapper for rpc-websockets client
// Re-exports the CommonClient as both default and named export

const CommonClient = require('../node_modules/rpc-websockets/dist/lib/client.cjs').default;

module.exports = CommonClient;
module.exports.default = CommonClient;
module.exports.CommonClient = CommonClient;
