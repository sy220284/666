export interface AuthorDialogOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

interface AuthorDialogBaseRequest {
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
}

export interface AuthorConfirmDialogRequest extends AuthorDialogBaseRequest {
  readonly kind: 'confirm';
}

export interface AuthorTextDialogRequest extends AuthorDialogBaseRequest {
  readonly kind: 'text';
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
}

export interface AuthorSelectDialogRequest extends AuthorDialogBaseRequest {
  readonly kind: 'select';
  readonly options: readonly AuthorDialogOption[];
  readonly initialValue?: string;
}

export interface AuthorNameDialogRequest extends AuthorDialogBaseRequest {
  readonly kind: 'name';
  readonly expectedName: string;
  readonly placeholder?: string;
}

export type AuthorDialogRequest =
  | AuthorConfirmDialogRequest
  | AuthorTextDialogRequest
  | AuthorSelectDialogRequest
  | AuthorNameDialogRequest;

export type AuthorDialogResult = boolean | string | null;

export interface PendingAuthorDialog {
  readonly id: number;
  readonly request: AuthorDialogRequest;
  readonly resolve: (result: AuthorDialogResult) => void;
}

type AuthorDialogListener = (pending: PendingAuthorDialog | null) => void;

let nextDialogId = 1;
let activeDialog: PendingAuthorDialog | null = null;
const dialogQueue: PendingAuthorDialog[] = [];
const listeners = new Set<AuthorDialogListener>();

function publish(): void {
  for (const listener of listeners) listener(activeDialog);
}

function showNext(): void {
  if (activeDialog || dialogQueue.length === 0) return;
  activeDialog = dialogQueue.shift() ?? null;
  publish();
}

function enqueue(request: AuthorDialogRequest): Promise<AuthorDialogResult> {
  return new Promise((resolve) => {
    dialogQueue.push({ id: nextDialogId++, request, resolve });
    showNext();
  });
}

export function subscribeAuthorDialog(listener: AuthorDialogListener): () => void {
  listeners.add(listener);
  listener(activeDialog);
  return () => listeners.delete(listener);
}

export function resolveAuthorDialog(id: number, result: AuthorDialogResult): void {
  if (!activeDialog || activeDialog.id !== id) return;
  const completed = activeDialog;
  activeDialog = null;
  completed.resolve(result);
  publish();
  showNext();
}

export async function authorConfirm(
  request: Omit<AuthorConfirmDialogRequest, 'kind'>,
): Promise<boolean> {
  return (await enqueue({ ...request, kind: 'confirm' })) === true;
}

export async function authorPrompt(
  request: Omit<AuthorTextDialogRequest, 'kind'>,
): Promise<string | null> {
  const result = await enqueue({ ...request, kind: 'text' });
  return typeof result === 'string' ? result : null;
}

export async function authorSelect(
  request: Omit<AuthorSelectDialogRequest, 'kind'>,
): Promise<string | null> {
  const result = await enqueue({ ...request, kind: 'select' });
  return typeof result === 'string' ? result : null;
}

export async function authorConfirmName(
  request: Omit<AuthorNameDialogRequest, 'kind'>,
): Promise<boolean> {
  return (await enqueue({ ...request, kind: 'name' })) === true;
}

export function resetAuthorDialogsForTesting(): void {
  if (activeDialog) activeDialog.resolve(null);
  for (const pending of dialogQueue.splice(0)) pending.resolve(null);
  activeDialog = null;
  nextDialogId = 1;
  publish();
}
