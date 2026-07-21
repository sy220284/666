import { create } from 'zustand';

export type PrimaryRoute =
  | 'home'
  | 'planning'
  | 'writing'
  | 'canon'
  | 'checks'
  | 'settings';
export type PanelMode = 'closed' | 'sidebar' | 'drawer';

export type UiTaskDisplay = Readonly<{
  id: string;
  label: string;
  progress: number | null;
}>;

export type UiState = {
  route: PrimaryRoute;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  leftPanel: PanelMode;
  rightPanel: PanelMode;
  dialog: string | null;
  taskDisplay: UiTaskDisplay | null;
  returnLocation: PrimaryRoute | null;
  setRoute: (route: PrimaryRoute) => void;
  selectProject: (projectId: string | null) => void;
  selectChapter: (chapterId: string | null) => void;
  setLeftPanel: (leftPanel: PanelMode) => void;
  setRightPanel: (rightPanel: PanelMode) => void;
  openDialog: (dialog: string, returnLocation?: PrimaryRoute) => void;
  closeDialog: () => void;
  setTaskDisplay: (taskDisplay: UiTaskDisplay | null) => void;
  reset: () => void;
};

const initialState = {
  route: 'home' as const,
  selectedProjectId: null,
  selectedChapterId: null,
  leftPanel: 'sidebar' as const,
  rightPanel: 'sidebar' as const,
  dialog: null,
  taskDisplay: null,
  returnLocation: null,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  setRoute: (route) => set({ route }),
  selectProject: (selectedProjectId) => set({ selectedProjectId }),
  selectChapter: (selectedChapterId) => set({ selectedChapterId }),
  setLeftPanel: (leftPanel) => set({ leftPanel }),
  setRightPanel: (rightPanel) => set({ rightPanel }),
  openDialog: (dialog, returnLocation) =>
    set({ dialog, ...(returnLocation ? { returnLocation } : {}) }),
  closeDialog: () => set({ dialog: null, returnLocation: null }),
  setTaskDisplay: (taskDisplay) => set({ taskDisplay }),
  reset: () => set(initialState),
}));
