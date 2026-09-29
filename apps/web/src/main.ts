import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import './styles/global.css';

// §53: the shell is precached, so opening the app with no network still gives a complete game.
registerSW({ immediate: true });

createApp(App).mount('#app');
