import type { Server } from 'http';
import { dbService, DatabaseService } from './db.js';

export interface ShutdownOptions {
  timeoutMs?: number;
  exitFn?: (code: number) => void;
  db?: Pick<DatabaseService, 'flush'>;
  processObj?: Pick<NodeJS.Process, 'on' | 'removeListener'>;
}

export interface ShutdownController {
  initiateShutdown: (signal: string) => Promise<void>;
  isShuttingDown: () => boolean;
}

/**
 * Creates and registers a graceful shutdown handler for the HTTP server and database persistence layer.
 *
 * Guaranteed lifecycle:
 * 1. Prevents duplicate shutdown executions if multiple signals arrive.
 * 2. Stops accepting new HTTP connections via server.close() and closes idle keep-alive connections.
 * 3. Awaits all pending database write operations via db.flush().
 * 4. Enforces a maximum shutdown timeout (default: SHUTDOWN_TIMEOUT_MS or 10,000 ms).
 * 5. If flush or close fails, or timeout expires, logs the error and exits with code 1.
 * 6. Exits cleanly with code 0 upon successful completion.
 */
export function setupGracefulShutdown(
  server: Server,
  options: ShutdownOptions = {}
): ShutdownController {
  const timeoutMs =
    options.timeoutMs ??
    (parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '', 10) || 10_000);
  const exitFn = options.exitFn ?? process.exit;
  const db = options.db ?? dbService;
  const proc = options.processObj ?? process;

  let shuttingDown = false;

  const initiateShutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      console.warn(`[Server] Shutdown already in progress. Ignoring duplicate signal: ${signal}`);
      return;
    }
    shuttingDown = true;
    console.log(`[Server] Received ${signal}. Initiating graceful shutdown (timeout: ${timeoutMs}ms)...`);

    // Force-exit timer if graceful shutdown hangs
    const forceTimer = setTimeout(() => {
      console.error(
        `[Server] Graceful shutdown timed out after ${timeoutMs}ms. Forcing process exit.`
      );
      exitFn(1);
    }, timeoutMs);

    if (forceTimer.unref) {
      forceTimer.unref();
    }

    try {
      // 1. Close HTTP server so new connections are rejected and active connections finish
      console.log('[Server] Closing HTTP server and rejecting new incoming connections...');
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
        // In Node 18.2+, close any idle keep-alive connections immediately
        if (typeof (server as any).closeIdleConnections === 'function') {
          (server as any).closeIdleConnections();
        }
      });
      console.log('[Server] HTTP server closed cleanly.');

      // 2. Flush pending database writes
      console.log('[Server] Flushing pending database writes...');
      await db.flush();
      console.log('[Server] All pending database writes successfully flushed to disk.');

      // 3. Clear timeout and exit cleanly
      clearTimeout(forceTimer);
      console.log('[Server] Graceful shutdown completed successfully.');
      exitFn(0);
    } catch (err) {
      clearTimeout(forceTimer);
      console.error('[Server] Critical error during graceful shutdown:', err);
      exitFn(1);
    }
  };

  const onSigterm = () => { void initiateShutdown('SIGTERM'); };
  const onSigint = () => { void initiateShutdown('SIGINT'); };

  proc.on('SIGTERM', onSigterm);
  proc.on('SIGINT', onSigint);

  return {
    initiateShutdown,
    isShuttingDown: () => shuttingDown,
  };
}

