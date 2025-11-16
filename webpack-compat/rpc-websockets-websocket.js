// Webpack compatibility wrapper for rpc-websockets websocket
// Re-exports the websocket module as both default and named export

const websocket = require('../node_modules/rpc-websockets/dist/lib/client/websocket.browser.cjs').default;

module.exports = websocket;
module.exports.default = websocket;
