<script lang="ts">
  import { X, Database, Loader2, Plus, Trash2, Plug } from 'lucide-svelte';
  import { Button } from './components/ui/button/index.js';
  import { Input } from './components/ui/input/index.js';
  import { Label } from './components/ui/label/index.js';
  import {
    connected,
    currentConnection,
    savedConnections,
    connectionLoading,
    connectionError,
    connect,
    disconnect,
    loadSavedConnections,
    saveConnection,
    deleteConnection,
    clearConnectionError,
  } from './stores/connection-store.js';
  import type { DatabaseConnection } from '@speajus/rlsify-types';

  interface Props {
    open: boolean;
    onClose: () => void;
    onConnected?: () => void;
    initialError?: string | null;
  }

  let { open, onClose, onConnected, initialError = null }: Props = $props();

  // Form state
  let connectionUrl = $state('');
  let connectionName = $state('');
  let host = $state('localhost');
  let port = $state('5432');
  let database = $state('postgres');
  let user = $state('postgres');
  let password = $state('');
  let ssl = $state(false);
  let selectedConnectionId = $state<string | null>(null);
  let isNewConnection = $state(true);

  // Parse database URL and fill in fields
  function parseConnectionUrl(url: string) {
    if (!url.trim()) return;

    try {
      // Handle postgres:// or postgresql:// URLs
      const urlToParse = url.trim();

      // Parse URL like: postgresql://user:password@host:port/database?sslmode=require
      const match = urlToParse.match(
        /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/([^?]+)(?:\?(.*))?$/
      );

      if (match) {
        const [, parsedUser, parsedPassword, parsedHost, parsedPort, parsedDatabase, queryString] = match;

        user = decodeURIComponent(parsedUser);
        password = decodeURIComponent(parsedPassword);
        host = parsedHost;
        port = parsedPort || '5432';
        database = parsedDatabase;

        // Check for SSL in query string
        if (queryString) {
          const params = new URLSearchParams(queryString);
          const sslMode = params.get('sslmode');
          ssl = sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca';
        }

        // Auto-generate a connection name if empty
        if (!connectionName) {
          connectionName = `${parsedDatabase}@${parsedHost}`;
        }
      }
    } catch (e) {
      console.error('Failed to parse connection URL:', e);
    }
  }

  // Watch for URL changes and parse
  $effect(() => {
    if (connectionUrl) {
      parseConnectionUrl(connectionUrl);
    }
  });

  // Load saved connections and auto-select last used connection when dialog opens
  $effect(() => {
    if (open) {
      // Load connections from localStorage
      loadSavedConnections();

      // Auto-select last used connection if available and we're in new connection mode
      if (isNewConnection && typeof window !== 'undefined') {
        const lastConnectionId = localStorage.getItem('rlsify_last_connection_id');
        if (lastConnectionId) {
          // Read directly from localStorage to avoid reactive dependency
          try {
            const stored = localStorage.getItem('rlsify_connections');
            const connections = stored ? JSON.parse(stored) : [];
            const lastConnection = connections.find((c: DatabaseConnection) => c.id === lastConnectionId);
            if (lastConnection) {
              selectConnection(lastConnection);
            }
          } catch (e) {
            console.error('Failed to load last connection:', e);
          }
        }
      }
    }
  });

  function selectConnection(conn: DatabaseConnection) {
    selectedConnectionId = conn.id;
    isNewConnection = false;
    connectionName = conn.name;
    host = conn.host;
    port = String(conn.port);
    database = conn.database;
    user = conn.user;
    password = conn.password;
    ssl = conn.ssl;
  }

  function handleNewConnection() {
    selectedConnectionId = null;
    isNewConnection = true;
    connectionUrl = '';
    connectionName = '';
    host = 'localhost';
    port = '5432';
    database = 'postgres';
    user = 'postgres';
    password = '';
    ssl = false;
    clearConnectionError();
  }

  async function handleConnect() {
    const result = await connect({
      host,
      port: Number(port),
      database,
      user,
      password,
      ssl,
    });

    if (result.success) {
      // Always save the connection, auto-generate name if not provided
      const name = connectionName.trim() || `${database}@${host}`;
      await saveConnection({
        id: isNewConnection ? undefined : selectedConnectionId ?? undefined,
        name,
        host,
        port: Number(port),
        database,
        user,
        password,
        ssl,
      });

      onConnected?.();
      onClose();
    }
  }

  async function handleDisconnect() {
    await disconnect();
  }

  async function handleDeleteConnection(id: string) {
    if (confirm('Are you sure you want to delete this saved connection?')) {
      await deleteConnection(id);
      if (selectedConnectionId === id) {
        handleNewConnection();
      }
    }
  }

  function handleClose() {
    clearConnectionError();
    onClose();
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-40"
    onclick={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="button"
    tabindex="-1"
  ></div>

  <!-- Dialog -->
  <div class="fixed inset-0 flex items-center justify-center z-50 p-4">
    <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-border">
        <div class="flex items-center gap-2">
          <Database class="h-5 w-5 text-primary" />
          <h2 class="text-lg font-semibold">Database Connections</h2>
        </div>
        <Button variant="ghost" size="icon" onclick={handleClose}>
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="flex h-[500px]">
        <!-- Saved Connections List -->
        <div class="w-48 border-r border-border p-2 overflow-y-auto">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted-foreground uppercase">Saved</span>
            <Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleNewConnection}>
              <Plus class="h-3 w-3" />
            </Button>
          </div>

          {#each $savedConnections as conn}
            <div
              class="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted flex items-center justify-between group cursor-pointer
                     {selectedConnectionId === conn.id ? 'bg-muted' : ''}"
              onclick={() => selectConnection(conn)}
              onkeydown={(e) => e.key === 'Enter' && selectConnection(conn)}
              role="button"
              tabindex="0"
            >
              <span class="truncate">{conn.name}</span>
              <button
                class="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive"
                onclick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.id); }}
              >
                <Trash2 class="h-3 w-3" />
              </button>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground p-2">No saved connections</p>
          {/each}
        </div>

        <!-- Connection Form -->
        <div class="flex-1 p-4 overflow-y-auto">
          {#if initialError || $connectionError}
            <div class="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              <div class="font-medium mb-1">Connection Error</div>
              {initialError || $connectionError}
              {#if (initialError || $connectionError || '').includes('service')}
                <div class="mt-2 text-xs opacity-80">
                  Run <code class="bg-destructive/20 px-1 rounded">docker-compose up -d</code> or <code class="bg-destructive/20 px-1 rounded">pnpm --filter @speajus/rlsify-service dev</code> to start the backend service.
                </div>
              {/if}
            </div>
          {/if}

          {#if $connected && $currentConnection}
            <div class="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded">
              <div class="flex items-center gap-2 text-sm text-green-600">
                <Plug class="h-4 w-4" />
                <span>Connected to <strong>{$currentConnection.database}</strong> at {$currentConnection.host}:{$currentConnection.port}</span>
              </div>
            </div>
          {/if}

          <div class="space-y-4">
            <!-- Database URL Input -->
            <div>
              <Label for="connectionUrl">Database URL</Label>
              <Input
                id="connectionUrl"
                bind:value={connectionUrl}
                placeholder="postgresql://user:password@host:port/database"
                class="font-mono text-xs"
              />
              <p class="text-xs text-muted-foreground mt-1">Paste a connection URL to auto-fill fields below</p>
            </div>

            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <span class="w-full border-t border-border"></span>
              </div>
              <div class="relative flex justify-center text-xs uppercase">
                <span class="bg-card px-2 text-muted-foreground">or enter manually</span>
              </div>
            </div>

            <div>
              <Label for="connectionName">Connection Name</Label>
              <Input
                id="connectionName"
                bind:value={connectionName}
                placeholder="My Database"
              />
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="col-span-2">
                <Label for="host">Host</Label>
                <Input id="host" bind:value={host} placeholder="localhost" />
              </div>
              <div>
                <Label for="port">Port</Label>
                <Input id="port" bind:value={port} placeholder="5432" />
              </div>
            </div>

            <div>
              <Label for="database">Database</Label>
              <Input id="database" bind:value={database} placeholder="postgres" />
            </div>

            <div>
              <Label for="user">User</Label>
              <Input id="user" bind:value={user} placeholder="postgres" />
            </div>

            <div>
              <Label for="password">Password</Label>
              <Input id="password" type="password" bind:value={password} />
            </div>

            <div class="flex items-center gap-2">
              <input type="checkbox" id="ssl" bind:checked={ssl} class="rounded" />
              <Label for="ssl" class="cursor-pointer">Use SSL</Label>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between p-4 border-t border-border">
        <div>
          {#if $connected}
            <Button variant="outline" onclick={handleDisconnect}>
              Disconnect
            </Button>
          {/if}
        </div>
        <div class="flex gap-2">
          <Button variant="outline" onclick={handleClose}>Cancel</Button>
          <Button onclick={handleConnect} disabled={$connectionLoading || !host || !database || !user}>
            {#if $connectionLoading}
              <Loader2 class="h-4 w-4 mr-2 animate-spin" />
            {/if}
            Connect
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}
