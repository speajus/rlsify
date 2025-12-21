<script lang="ts">
  import { Button } from '@ui/components/ui/button';
  import { Input } from '@ui/components/ui/input';
  import { Label } from '@ui/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@ui/components/ui/card';
  import { Alert, AlertDescription, AlertTitle } from '@ui/components/ui/alert';
  import { Switch } from '@ui/components/ui/switch';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  interface Props {
    onconnect?: () => void;
    ondisconnect?: () => void;
  }

  let { onconnect, ondisconnect }: Props = $props();

  interface ConnectionStatus {
    connected: boolean;
    database?: string;
    host?: string;
    port?: number;
    user?: string;
  }

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

  // Form state
  let connectionName = $state('');
  let host = $state('localhost');
  let port = $state('5432');
  let database = $state('postgres');
  let user = $state('postgres');
  let password = $state('');
  let ssl = $state(false);
  let dbUrl = $state('');
  let inputMode = $state<'fields' | 'url'>('fields');

  // Connection state
  let isConnecting = $state(false);
  let error = $state<string | null>(null);
  let connectionStatus = $state<ConnectionStatus>({ connected: false });

  // Saved connections
  let savedConnections = $state<SavedConnection[]>([]);
  let selectedConnectionId = $state<string | null>(null);
  let isNewConnection = $state(true);

  // localStorage keys
  const STORAGE_KEY_CONNECTIONS = 'rlsify_connections';
  const STORAGE_KEY_LAST_CONNECTION = 'rlsify_last_connection_id';

  // Load saved connections and check connection on mount
  $effect(() => {
    loadSavedConnections();
    checkConnectionStatus();
  });

  // Parse URL and populate fields when URL changes (in URL mode)
  $effect(() => {
    if (inputMode === 'url' && dbUrl.trim()) {
      // Try to parse URL and update fields
      parseUrl(dbUrl);
    }
  });

  function loadSavedConnections() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONNECTIONS);
      savedConnections = stored ? JSON.parse(stored) : [];

      const lastId = localStorage.getItem(STORAGE_KEY_LAST_CONNECTION);

      if (lastId && savedConnections.some(c => c.id === lastId)) {
        selectConnection(lastId);
      } else if (savedConnections.length > 0) {
        // Select the first connection by default
        selectConnection(savedConnections[0].id);
      }
    } catch (err) {
      console.error('Failed to load saved connections:', err);
    }
  }

  function saveConnectionsToStorage(connections: SavedConnection[]) {
    try {
      localStorage.setItem(STORAGE_KEY_CONNECTIONS, JSON.stringify(connections));
    } catch (err) {
      console.error('Failed to save connections to localStorage:', err);
    }
  }

  function setLastConnectionId(id: string) {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_CONNECTION, id);
    } catch (err) {
      console.error('Failed to save last connection ID:', err);
    }
  }

  function selectConnection(id: string) {
    const conn = savedConnections.find(c => c.id === id);
    if (conn) {
      selectedConnectionId = id;
      isNewConnection = false;
      connectionName = conn.name;
      host = conn.host;
      port = String(conn.port);
      database = conn.database;
      user = conn.user;
      password = conn.password;
      ssl = conn.ssl;
      dbUrl = buildUrlFromFields();
    }
  }

  function handleNewConnection() {
    selectedConnectionId = null;
    isNewConnection = true;
    connectionName = '';
    host = 'localhost';
    port = '5432';
    database = 'postgres';
    user = 'postgres';
    password = '';
    ssl = false;
    dbUrl = '';
  }

  function buildUrlFromFields(): string {
    const sslParam = ssl ? '?sslmode=require' : '';
    const encodedPassword = encodeURIComponent(password);
    return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}${sslParam}`;
  }

  /**
   * Parse a database URL and populate the form fields.
   * Returns true if parsing succeeded, false otherwise.
   */
  function parseUrl(url: string): boolean {
    try {
      // Convert postgres:// or postgresql:// to http:// for URL parsing
      // since the URL constructor doesn't recognize postgres protocol
      const normalized = url
        .replace(/^postgres:\/\//, 'http://')
        .replace(/^postgresql:\/\//, 'http://');

      const parsed = new URL(normalized);

      host = parsed.hostname || 'localhost';
      port = parsed.port || '5432';
      database = parsed.pathname.slice(1) || 'postgres';
      user = parsed.username || 'postgres';
      password = decodeURIComponent(parsed.password || '');
      ssl = parsed.searchParams.get('sslmode') === 'require' ||
            parsed.searchParams.get('ssl') === 'true';

      // Auto-generate connection name from URL if not already set
      if (!connectionName.trim() && database) {
        connectionName = `${database}@${host}`;
      }
      return true;
    } catch {
      return false;
    }
  }

  

  async function checkConnectionStatus() {
    try {
      connectionStatus = await window.electronAPI.getDatabaseStatus();
      // Just update the status display, don't fire onconnect
      // onconnect should only be called when user explicitly connects
    } catch (err) {
      console.error('Failed to get connection status:', err);
    }
  }

  async function handleConnect() {
    error = null;

    // Parse URL if in URL mode
    if (inputMode === 'url') {
      if (!parseUrl(dbUrl)) {
        error = 'Invalid database URL format. Expected: postgresql://user:pass@host:port/database';
        return;
      }
    }

    // Validate connection name for new connections
    if (isNewConnection && !connectionName.trim()) {
      error = 'Please enter a name for this connection';
      return;
    }

    isConnecting = true;

    try {
      // Connect to the database via electron API
      const result = await window.electronAPI.connectDatabase({
        host,
        port: Number(port),
        database,
        user,
        password,
        ssl,
      });

      if (result.success) {
        // Save the connection to localStorage
        const connectionData: SavedConnection = {
          id: isNewConnection ? crypto.randomUUID() : selectedConnectionId!,
          name: connectionName.trim() || `${database}@${host}`,
          host,
          port: Number(port),
          database,
          user,
          password,
          ssl,
          createdAt: isNewConnection ? Date.now() : savedConnections.find(c => c.id === selectedConnectionId)?.createdAt ?? Date.now(),
          lastUsedAt: Date.now(),
        };

        // Update or add connection in the list
        if (isNewConnection) {
          savedConnections = [...savedConnections, connectionData];
        } else {
          savedConnections = savedConnections.map(c =>
            c.id === connectionData.id ? connectionData : c
          );
        }

        // Save to localStorage
        saveConnectionsToStorage(savedConnections);
        setLastConnectionId(connectionData.id);

        selectedConnectionId = connectionData.id;
        isNewConnection = false;

        await checkConnectionStatus();
        onconnect?.();
      } else {
        error = result.error || 'Failed to connect to database';
      }
    } catch (err) {
      console.error('Connection error:', err);
      error = err instanceof Error ? err.message : String(err);
    } finally {
      isConnecting = false;
    }
  }

  async function handleDisconnect() {
    try {
      await window.electronAPI.disconnectDatabase();
      connectionStatus = { connected: false };
      ondisconnect?.();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function handleDeleteConnection(id: string) {
    if (!confirm('Are you sure you want to delete this saved connection?')) return;

    try {
      // Remove from the list
      savedConnections = savedConnections.filter(c => c.id !== id);

      // Save to localStorage
      saveConnectionsToStorage(savedConnections);

      // If we deleted the currently selected connection, select another one
      if (selectedConnectionId === id) {
        if (savedConnections.length > 0) {
          selectConnection(savedConnections[0].id);
        } else {
          handleNewConnection();
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleOpenInNewWindow(id: string) {
    try {
      await window.electronAPI.openNewWindow(id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<Card class="w-full max-w-lg">
  <CardHeader>
    <CardTitle>Database Connection</CardTitle>
    <CardDescription>
      {#if connectionStatus.connected}
        Connected to {connectionStatus.database} on {connectionStatus.host}
      {:else}
        Connect to a PostgreSQL database to manage RLS policies
      {/if}
    </CardDescription>
  </CardHeader>

  <CardContent class="space-y-4">
    {#if error}
      <Alert variant="destructive">
        <AlertTitle>Connection Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    {/if}

    {#if !connectionStatus.connected}
      <!-- Saved Connections Selector -->
      {#if savedConnections.length > 0}
        <div class="space-y-2">
          <Label>Saved Connections</Label>
          <div class="flex gap-2">
            <select
              class="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedConnectionId ?? ''}
              onchange={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                if (value) selectConnection(value);
              }}
            >
              {#each savedConnections as conn}
                <option value={conn.id}>{conn.name}</option>
              {/each}
            </select>
            <Button variant="outline" size="icon" onclick={handleNewConnection} title="New Connection">
              <Plus class="h-4 w-4" />
            </Button>
            {#if selectedConnectionId}
              <Button
                variant="outline"
                size="icon"
                onclick={() => selectedConnectionId && handleOpenInNewWindow(selectedConnectionId)}
                title="Open in New Window"
              >
                <ExternalLink class="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onclick={() => selectedConnectionId && handleDeleteConnection(selectedConnectionId)}
                title="Delete Connection"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        </div>
        <div class="border-t border-border my-4"></div>
      {/if}

      <!-- Connection Name -->
      <div class="space-y-2">
        <Label for="connectionName">Connection Name</Label>
        <Input
          id="connectionName"
          bind:value={connectionName}
          placeholder={`${database}@${host}`}
        />
        <p class="text-xs text-muted-foreground">A friendly name to identify this connection</p>
      </div>

      <Tabs bind:value={inputMode} class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="fields">Connection Fields</TabsTrigger>
          <TabsTrigger value="url">Connection URL</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" class="space-y-4 mt-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="host">Host</Label>
              <Input id="host" bind:value={host} placeholder="localhost" />
            </div>
            <div class="space-y-2">
              <Label for="port">Port</Label>
              <Input id="port" bind:value={port} placeholder="5432" type="number" />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="database">Database</Label>
            <Input id="database" bind:value={database} placeholder="my_database" />
          </div>

          <div class="space-y-2">
            <Label for="user">Username</Label>
            <Input id="user" bind:value={user} placeholder="postgres" />
          </div>

          <div class="space-y-2">
            <Label for="password">Password</Label>
            <Input id="password" bind:value={password} type="password" placeholder="••••••••" />
          </div>

          <div class="flex items-center space-x-2">
            <Switch id="ssl" bind:checked={ssl} />
            <Label for="ssl">Use SSL</Label>
          </div>
        </TabsContent>

        <TabsContent value="url" class="space-y-4 mt-4">
          <div class="space-y-2">
            <Label for="dbUrl">Database URL</Label>
            <Input
              id="dbUrl"
              bind:value={dbUrl}
              placeholder="postgresql://user:password@host:5432/database"
              class="font-mono text-sm"
            />
            <p class="text-xs text-muted-foreground">
              Format: postgresql://user:password@host:port/database?sslmode=require
            </p>
          </div>
        </TabsContent>
      </Tabs>
    {/if}
  </CardContent>

  <CardFooter class="flex gap-2">
    {#if connectionStatus.connected}
      <Button variant="destructive" onclick={handleDisconnect} class="w-full">
        Disconnect
      </Button>
    {:else}
      <Button
        onclick={handleConnect}
        disabled={isConnecting || (!database && inputMode === 'fields') || (!dbUrl && inputMode === 'url')}
        class="w-full"
      >
        {#if isConnecting}
          Connecting...
        {:else if isNewConnection}
          Save & Connect
        {:else}
          Connect
        {/if}
      </Button>
    {/if}
  </CardFooter>
</Card>

