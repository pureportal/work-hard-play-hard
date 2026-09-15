export const GITHUB_TRAY_ASSET_ID = "decor-pr-tray";
export const GITHUB_MAILROOM_VIEWS = ["repository", "mine", "reviews", "merged"] as const;
export type GitHubMailroomView = typeof GITHUB_MAILROOM_VIEWS[number];

export interface GitHubStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  login: string | null;
  installationUrl: string | null;
}

export interface GitHubRepository {
  fullName: string;
  private: boolean;
}

export interface GitHubRepositories {
  repositories: GitHubRepository[];
  nextPage: number | null;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  author: string | null;
  draft: boolean;
  state: "OPEN" | "CLOSED" | "MERGED";
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  updatedAt: string;
  mergedAt: string | null;
}

export interface GitHubMailroom {
  repository: GitHubRepository;
  pullRequests: GitHubPullRequest[];
  total: number;
  nextCursor: string | null;
}
