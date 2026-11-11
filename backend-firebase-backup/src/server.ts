import { createApp } from './app.js';
import { initializeFirebase } from './config/firebase.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
initializeFirebase(config);

const app = createApp(config);
app.listen(config.port, () => {
  console.info(JSON.stringify({
    event: 'server_started',
    port: config.port,
    environment: config.environment,
    firestoreEmulator: Boolean(config.firestoreEmulatorHost),
  }));
});
