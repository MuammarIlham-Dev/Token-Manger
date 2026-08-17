import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) {
  // Always point to the canonical lib/db/local.db two levels above artifacts/api-server
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../../../lib/db/local.db")}`;
}
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
