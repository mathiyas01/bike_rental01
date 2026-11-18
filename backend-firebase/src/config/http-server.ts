import type { Server } from 'node:http';

export interface HttpServerTimeouts {
  requestTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
  headersTimeoutMs?: number;
}

export function configureHttpServer(
  server: Server,
  options: HttpServerTimeouts = {},
): void {
  const keepAliveTimeoutMs = options.keepAliveTimeoutMs ?? 65_000;
  const headersTimeoutMs = options.headersTimeoutMs ?? 66_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;

  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.headersTimeout = headersTimeoutMs;
  server.requestTimeout = requestTimeoutMs;
}

export function registerGracefulShutdown(
  server: Server,
  options: {
    shutdownTimeoutMs?: number;
    onExit?: (code: number) => void;
    processTarget?: Pick<NodeJS.Process, 'on'>;
  } = {},
): () => void {
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
  const onExit = options.onExit ?? ((code: number) => process.exit(code));
  const target = options.processTarget ?? process;
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(JSON.stringify({ event: 'server_stopping', signal }));

    const forceTimer = setTimeout(() => {
      console.error(JSON.stringify({ event: 'server_shutdown_timeout', signal }));
      onExit(1);
    }, shutdownTimeoutMs);
    forceTimer.unref();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        console.error(JSON.stringify({ event: 'server_shutdown_error', signal, message: error.message }));
        onExit(1);
        return;
      }
      console.info(JSON.stringify({ event: 'server_stopped', signal }));
      onExit(0);
    });
  };

  target.on('SIGTERM', () => shutdown('SIGTERM'));
  target.on('SIGINT', () => shutdown('SIGINT'));

  return () => shutdown('MANUAL');
}
