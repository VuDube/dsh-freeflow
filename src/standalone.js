import { createFreeflow, loadConfig } from './index.js';

const configPath = process.argv[2] || process.env.DSH_FREEFLOW_CONFIG || null;
const config = await loadConfig(configPath);
const freeflow = createFreeflow(config);
freeflow.start();
const server = await freeflow.listen();
const shutdown = () => {
  freeflow.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
