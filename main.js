// main.js
// Application Entry Point

/* global Vue, Pinia */
import { App } from './components.js';

const { createApp } = Vue;
const { createPinia } = Pinia;

const app = createApp(App);
app.use(createPinia());
app.mount('#app');