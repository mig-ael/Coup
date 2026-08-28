/**
 * Deployment entrypoint. Render (and most Node hosts) inject the port to bind.
 */
import server from "./index.js";

const port = Number(process.env["PORT"] ?? 2567);

await server.listen(port);
console.log(`Coup server listening on ${port}`);
