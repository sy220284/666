const unavailable = (): never => {
  throw new Error(
    'Electron runtime API is unavailable in Node product-test coverage. Mock it in the test.',
  );
};

export const app = { whenReady: unavailable };
export const BrowserWindow = class {};
export const contextBridge = { exposeInMainWorld: unavailable };
export const dialog = {};
export const ipcMain = {};
export const ipcRenderer = {};
export const net = {};
export const protocol = {};
export const screen = {};
export const session = {};
export const shell = {};
export const utilityProcess = {};
export const MessageChannelMain = class {};
