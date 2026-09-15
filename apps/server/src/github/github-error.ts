export class GitHubError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly retryAfter?: number) {
    super(message);
    this.name = "GitHubError";
  }
}
