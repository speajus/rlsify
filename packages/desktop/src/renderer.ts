/**
 * Electron Renderer Entry Point
 *
 * This file initializes the Svelte application in the Electron renderer process.
 * It sets up the IPC transport for gRPC communication with the main process.
 */

// Import Tailwind CSS styles
import './app.css';

import { mount } from 'svelte';


import { createIpcTransport } from './transport/ipc-transport.js';
import App from './App.svelte';
import { createContainer } from '@speajus/diblob';
import { configureClients } from '@ui/api/client';

// Create the IPC transport using the exposed electronAPI
const transport = createIpcTransport(window.electronAPI);
const container = createContainer();

// Configure the UI package to use IPC clients instead of HTTP
configureClients(container, transport);

// Mount the Svelte application
const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;

