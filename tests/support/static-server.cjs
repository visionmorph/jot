const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const root = path.resolve(__dirname, "../..");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, `.${requestedPath}`);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(contents);
  });
});

server.listen(port, host, () => {
  console.log(`Component authoring tool available at http://${host}:${port}`);
});

const closeServer = () => server.close(() => process.exit(0));
process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
