/**
 * Electron Main Process
 *
 * Sets up the main Electron window and IPC handlers for gRPC communication.
 * Uses @speajus/diblob for dependency injection and service management.
 *
 * Based on the pattern from gazel: https://github.com/jspears/gazel
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBinary } from '@bufbuild/protobuf';
import type { DescMessage, DescMethodUnary, DescMethodStreaming, DescService } from '@bufbuild/protobuf';
import { registerLoggerBlobs } from '@speajus/diblob-logger';
import Store from 'electron-store';
import {
  SchemaServiceProto,
  PolicyServiceProto,
  HealthServiceProto,
} from '@speajus/rlsify-types';

// Types for saved database connections
interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

// Settings store for persisting database connection info
interface StoreSchema {
  connections: SavedConnection[];
  lastConnectionId?: string;
}

const store = new Store<StoreSchema>({
  name: 'rlsify-settings',
  encryptionKey: 'rlsify-desktop-v1', // Simple encryption for password
  defaults: {
    connections: [],
  },
});



// ============================================================================
// Simple Local Service Registry (avoiding diblob-connect blob issues)
// ============================================================================

const serviceRegistry = new Map<string, unknown>();
const serviceDefinitions = new Map<string, DescService>();

const localServiceRegistry = {
  registerService(proto: DescService, impl: unknown): void {
    serviceRegistry.set(proto.typeName, impl);
    serviceDefinitions.set(proto.typeName, proto);
  },
  getService(typeName: string): unknown | undefined {
    return serviceRegistry.get(typeName);
  },
  getServiceDefinition(typeName: string): DescService | undefined {
    return serviceDefinitions.get(typeName);
  },
  clear(): void {
    serviceRegistry.clear();
    serviceDefinitions.clear();
  },
};

import { registerDatabaseConfig,  pool, type DatabaseConfig, dbConfig } from './container.js';
// Import from /services subpath to avoid side effects from the main export
import type { IpcStreamRequest, IpcUnaryRequest } from './transport/ipc-transport.js';
import { createContainer } from '@speajus/diblob';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Track active streams for cleanup
const activeStreams = new Map<string, { cancel: () => void }>();

// Container and database state
const container = createContainer();

/**
 * Create the main application window
 */
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    title: 'RLSify - PostgreSQL RLS Policy Editor',
  });

  // Load the UI
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return mainWindow;
}


/**
 * Find a method in a service definition
 */
function findMethod(
  service: DescService,
  methodName: string
): DescMethodUnary<DescMessage, DescMessage> | DescMethodStreaming<DescMessage, DescMessage> | undefined {
  for (const method of service.methods) {
    if (method.localName === methodName || method.name === methodName) {
      return method as DescMethodUnary<DescMessage, DescMessage> | DescMethodStreaming<DescMessage, DescMessage>;
    }
  }
  return undefined;
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Handle unary gRPC calls
 */
ipcMain.handle('grpc:unary', async (_event, request: IpcUnaryRequest) => {
  const { service: serviceName, method: methodName, message } = request;

  // Check if container is initialized (database connected)
  if (!container) {
    throw new Error('Not connected to database. Please connect first.');
  }

  const serviceImpl = localServiceRegistry.getService(serviceName);
  if (!serviceImpl) {
    throw new Error(`Service not found: ${serviceName}. Make sure services are initialized.`);
  }

  // Call the method on the service implementation
  const methodFn = (serviceImpl as Record<string, unknown>)[methodName];
  if (typeof methodFn !== 'function') {
    throw new Error(`Method not found: ${methodName} on service ${serviceName}`);
  }

  return await methodFn.call(serviceImpl, message);
});

/**
 * Handle streaming gRPC calls
 */
ipcMain.handle('grpc:stream:start', async (event, request: IpcStreamRequest) => {
  const { streamId, service: serviceName, method: methodName, message } = request;

  // Check if container is initialized (database connected)
  if (!container) {
    throw new Error('Not connected to database. Please connect first.');
  }

  const serviceImpl = localServiceRegistry.getService(serviceName);
  if (!serviceImpl) {
    throw new Error(`Service not found: ${serviceName}. Make sure services are initialized.`);
  }

  const methodFn = (serviceImpl as Record<string, unknown>)[methodName];
  if (typeof methodFn !== 'function') {
    throw new Error(`Method not found: ${methodName} on service ${serviceName}`);
  }

  const dataChannel = `grpc:stream:${streamId}:data`;
  const completeChannel = `grpc:stream:${streamId}:complete`;
  const errorChannel = `grpc:stream:${streamId}:error`;

  let cancelled = false;

  // Track this stream for cancellation
  activeStreams.set(streamId, {
    cancel: () => {
      cancelled = true;
    },
  });

  // Start streaming in the background
  (async () => {
    try {
      const result = await methodFn.call(serviceImpl, message);

      // Check if result is an async iterable (streaming response)
      if (result && typeof result[Symbol.asyncIterator] === 'function') {
        for await (const msg of result as AsyncIterable<unknown>) {
          if (cancelled) break;
          // Find the method definition to get the output schema
          const serviceDef = localServiceRegistry.getServiceDefinition(serviceName);
          if (serviceDef) {
            const methodDef = findMethod(serviceDef, methodName);
            if (methodDef) {
              // Cast to expected type for toBinary
              const binary = toBinary(methodDef.output, msg as Parameters<typeof toBinary>[1]);
              event.sender.send(dataChannel, binary);
            }
          }
        }
      }
      event.sender.send(completeChannel);
    } catch (err) {
      event.sender.send(errorChannel, err instanceof Error ? err.message : String(err));
    } finally {
      activeStreams.delete(streamId);
    }
  })();

  return { success: true };
});

/**
 * Handle stream cancellation
 */
ipcMain.on('grpc:stream:cancel', (_event, streamId: string) => {
  const stream = activeStreams.get(streamId);
  if (stream) {
    stream.cancel();
    activeStreams.delete(streamId);
  }
});

// ============================================================================
// Database Connection Handlers
// ============================================================================

/**
 * Handle database connection
 */
ipcMain.handle('database:connect', async (_event, config: DatabaseConfig) => {
  try {
    // Dispose existing container if any
    if (container) {
      await container.dispose();
      localServiceRegistry.clear();
    }
    registerLoggerBlobs(container);

    // Create new container with the provided config
    registerDatabaseConfig(config, container);
    

    // Verify the connection actually works by running a simple query
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    // Save successful connection settings
    store.set('lastConnection', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ?? false,
    });

    return { success: true };
  } catch (error) {
    // Connection failed, clean up
    if (container) {
      try {
        await container.dispose();
      } catch {
        // Ignore disposal errors
      }

      localServiceRegistry.clear();
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Handle database disconnection
 */
ipcMain.handle('database:disconnect', async () => {
  if (container) {
    await container.dispose();

    }
      localServiceRegistry.clear();
});

/**
 * Get database connection status
 */
ipcMain.handle('database:status', () => {
  if (container) {
    return {
      connected: true,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      ssl: dbConfig.ssl,

    };
  }
  return { connected: false };
});

// Connection management has been moved to localStorage in the renderer process
// Connection info is now stored client-side and only sent to the service when connecting

/**
 * Open a new window (optionally with a specific connection)
 */
ipcMain.handle('database:openNewWindow', (_event, connectionId?: string) => {
  const newWindow = createWindow();

  // If a connection ID was provided, we'll pass it to the new window
  // The renderer will handle connecting after load
  if (connectionId) {
    newWindow.webContents.once('did-finish-load', () => {
      newWindow.webContents.send('connect-to-database', connectionId);
    });
  }

  return { success: true };
});

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Cleanup container on exit
  if (container) {
    await container.dispose();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Vite dev server URL declaration (injected by electron-forge)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
