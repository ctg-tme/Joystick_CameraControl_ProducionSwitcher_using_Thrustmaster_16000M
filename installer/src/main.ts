import { ConfiguratorApp } from './app';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Unable to find installer root');

void new ConfiguratorApp(root).initialize();
