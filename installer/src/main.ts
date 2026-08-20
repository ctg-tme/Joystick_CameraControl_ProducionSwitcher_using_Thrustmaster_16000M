import { ConfiguratorApp } from './app';
import './vendor/magnetic/token-theme-variables.css';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Unable to find installer root');

void new ConfiguratorApp(root).initialize();
