import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  assertTemporaryUiState,
  createInitialRendererUiState,
  reduceRendererUiState,
  type RendererUiAction,
  type RendererUiState,
} from './ui-state-boundary.js';

export interface RendererUiStoreState extends RendererUiState {
  readonly dispatch: (action: RendererUiAction) => void;
}

export type RendererUiStore = StoreApi<RendererUiStoreState>;

export function createRendererUiStore(
  initialState: RendererUiState = createInitialRendererUiState(),
): RendererUiStore {
  assertTemporaryUiState(initialState);

  return createStore<RendererUiStoreState>((set) => ({
    ...initialState,
    dispatch: (action) => {
      set((state) => ({
        ...reduceRendererUiState(state, action),
        dispatch: state.dispatch,
      }));
    },
  }));
}

export const rendererUiStore = createRendererUiStore();

export function useRendererUiStore<Selection>(
  selector: (state: RendererUiStoreState) => Selection,
): Selection {
  return useStore(rendererUiStore, selector);
}
