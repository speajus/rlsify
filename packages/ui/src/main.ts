import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { createContainer } from '@speajus/diblob';
import { createConnectTransport } from '@connectrpc/connect-web';
import { configureClients } from '$lib/api/client.js';

// Create HTTP transport for web (proxied through Vite to backend)
const transport = createConnectTransport({
  baseUrl: '',
});

// Create container and configure clients
const container = createContainer();
configureClients(container, transport);

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;

