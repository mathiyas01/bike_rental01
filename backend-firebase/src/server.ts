import './config/server-env.js';
import { createApp } from './app.js';
import { initializeFirebase } from './config/firebase.js';
import { loadConfig } from './config/env.js';
import { configureHttpServer, registerGracefulShutdown } from './config/http-server.js';

const config = loadConfig();
const { firestore } = initializeFirebase(config);

const app = createApp(config, firestore);
const server = app.listen(config.port, () => {
  console.info(JSON.stringify({
    event: 'server_started',
    port: config.port,
    environment: config.environment,
    firestoreEmulator: Boolean(config.firestoreEmulatorHost),
  }));
});

configureHttpServer(server);
registerGracefulShutdown(server);
