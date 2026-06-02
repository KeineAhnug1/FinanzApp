// Entry point for the Stocks page (ES module).
// Imports bootstrap which sets up event listeners, then calls fnInitApp().

import '@shared/unified-ui.css';
import './ShareView.css';
import '@shared/js/topbar.js';
import { fnInitApp } from './bootstrap.js';

fnInitApp();
