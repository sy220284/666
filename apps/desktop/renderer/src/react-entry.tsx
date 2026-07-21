import { createRoot } from 'react-dom/client';

import { App } from './app/App.js';
import { mountLegacySurface } from './foundation/legacy-surface.js';

const existingRoot = document.querySelector<HTMLElement>('[data-react-root]');
const container = existingRoot ?? document.createElement('div');
if (!existingRoot) {
  container.dataset.reactRoot = '';
  document.body.prepend(container);
}

const root = createRoot(container);
root.render(<App />);
void mountLegacySurface();
window.addEventListener('beforeunload', () => root.unmount(), { once: true });
