// Comprehensive rpc-websockets compatibility shim
// Provides all exports that different versions of @solana/web3.js expect

const clientModule = require('../node_modules/rpc-websockets/dist/lib/client.cjs');
const websocketModule = require('../node_modules/rpc-websockets/dist/lib/client/websocket.browser.cjs');

// Get the CommonClient class (default export from client.cjs)
const CommonClient = clientModule.default || clientModule;

// Get the WebSocket factory (default export from websocket.browser.cjs)
const WebSocket = websocketModule.default || websocketModule;

// Export everything in multiple formats for maximum compatibility
module.exports = {
  CommonClient,
  WebSocket,
  Client: CommonClient, // Some code might expect Client
  default: CommonClient,
};

// Also set as default for ESM imports
module.exports.default = CommonClient;
