const statusElement = document.querySelector<HTMLElement>('[data-core-status]');
const diagnosticElement = document.querySelector<HTMLElement>('[data-diagnostic-id]');
const versionElement = document.querySelector<HTMLElement>('[data-app-version]');
const restartButton = document.querySelector<HTMLButtonElement>('[data-restart-core]');

function setStatus(status: string, diagnosticId: string | null): void {
  if (statusElement) statusElement.textContent = status;
  if (diagnosticElement) {
    diagnosticElement.textContent = diagnosticId ? `Diagnostic: ${diagnosticId}` : '';
  }
}

async function refresh(): Promise<void> {
  const [info, core] = await Promise.all([
    window.worldforge.app.getInfo(),
    window.worldforge.app.getCoreStatus(),
  ]);
  if (info.ok && versionElement) {
    versionElement.textContent = `WorldForge ${info.data.version} · ${info.data.platform}`;
  }
  if (core.ok) {
    setStatus(core.data.status, core.data.diagnosticId);
  } else {
    setStatus(core.error.code, core.error.diagnosticId ?? null);
  }
}

restartButton?.addEventListener('click', async () => {
  restartButton.disabled = true;
  const result = await window.worldforge.app.restartCore();
  if (result.ok) {
    setStatus(result.data.status.status, result.data.status.diagnosticId);
  } else {
    setStatus(result.error.code, result.error.diagnosticId ?? null);
  }
  restartButton.disabled = false;
});

void refresh();

export const rendererLayer = {
  name: '@worldforge/renderer',
  responsibility: 'sandboxed-user-interface',
} as const;
