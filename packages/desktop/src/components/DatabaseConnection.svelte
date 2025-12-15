<script lang="ts">
  import { Button } from '@ui/components/ui/button';
  import { Input } from '@ui/components/ui/input';
  import { Label } from '@ui/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@ui/components/ui/card';
  import { Alert, AlertDescription, AlertTitle } from '@ui/components/ui/alert';
  import { Switch } from '@ui/components/ui/switch';

  interface Props {
    onconnect?: () => void;
    ondisconnect?: () => void;
  }

  let { onconnect, ondisconnect }: Props = $props();

  interface ConnectionStatus {
    connected: boolean;
    database?: string;
    host?: string;
  }

  // Form state
  let host = $state('localhost');
  let port = $state('5432');
  let database = $state('postgres');
  let user = $state('postgres');
  let password = $state('');
  let ssl = $state(false);

  // Connection state
  let isConnecting = $state(false);
  let error = $state<string | null>(null);
  let connectionStatus = $state<ConnectionStatus>({ connected: false });

  // Check initial connection status
  $effect(() => {
    checkConnectionStatus();
  });

  async function checkConnectionStatus() {
    try {
      connectionStatus = await window.electronAPI.getDatabaseStatus();
      if (connectionStatus.connected) {
        onconnect?.();
      }
    } catch (err) {
      console.error('Failed to get connection status:', err);
    }
  }

  async function handleConnect() {
    error = null;
    isConnecting = true;

    try {
      console.log('Connecting to database...');
      const result = await window.electronAPI.connectDatabase({
        host,
        port: parseInt(port, 10),
        database,
        user,
        password,
        ssl,
      });

      console.log('Connection result:', result);

      if (result.success) {
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
</script>

<Card class="w-full max-w-md">
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
    {/if}
  </CardContent>

  <CardFooter>
    {#if connectionStatus.connected}
      <Button variant="destructive" onclick={handleDisconnect} class="w-full">
        Disconnect
      </Button>
    {:else}
      <Button onclick={handleConnect} disabled={isConnecting || !database} class="w-full">
        {#if isConnecting}
          Connecting...
        {:else}
          Connect
        {/if}
      </Button>
    {/if}
  </CardFooter>
</Card>

