const http = require("node:http");
const { host, port, startStaticServer } = require("./static-server.cjs");

function isStaticServerAvailable() {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path: "/", timeout: 1_000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

module.exports = async function globalSetup() {
  if (await isStaticServerAvailable()) {
    if (process.env.CI) throw new Error(`Static server URL http://${host}:${port}/ is already in use.`);
    return undefined;
  }

  const server = await startStaticServer();
  return () => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeAllConnections?.();
  });
};
