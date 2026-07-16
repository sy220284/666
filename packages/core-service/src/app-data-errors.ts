export type AppDataRepositoryErrorCode =
  'RECENT_PROJECT_NOT_FOUND' | 'RECENT_PROJECT_PATH_MISSING' | 'RECENT_PROJECT_PATH_CONFLICT';

export class AppDataRepositoryError extends Error {
  readonly code: AppDataRepositoryErrorCode;

  constructor(code: AppDataRepositoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppDataRepositoryError';
    this.code = code;
  }
}
