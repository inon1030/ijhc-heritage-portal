// Verification only: refuse sockets before they can leave this process.
// Inherited through NODE_OPTIONS by Next workers. Never loaded by the app.
import net from 'node:net';
net.Socket.prototype.connect = function () {
  throw new Error('Offline verification: network connections are disabled');
};
globalThis.fetch = async function () {
  throw new Error('Offline verification: fetch is disabled');
};
