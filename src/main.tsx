import { render } from 'preact';
import { App } from './app';
import './styles.css';
import { applyColorScheme, loadColorScheme } from './ui/prefs';

// Before the first render, so the page never flashes in the wrong mode.
applyColorScheme(loadColorScheme());

const root = document.getElementById('app');
if (root) render(<App />, root);
