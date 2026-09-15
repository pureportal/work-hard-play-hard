import { z } from "zod";
import type { GitHubMailroom, GitHubMailroomView, GitHubRepositories } from "@workhard/shared";
import type { GitHubClient } from "./github-client.js";
import { GitHubError } from "./github-error.js";

export const repositoryNameSchema = z.string().max(140).regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/)
  .refine((value) => ![".", ".."].includes(value.split("/")[1]!));
const repositorySchema = z.object({ full_name: repositoryNameSchema, private: z.boolean() });
const searchSchema = z.object({ data: z.object({ search: z.object({
  issueCount: z.number().int().nonnegative(),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
  nodes: z.array(z.object({
    number: z.number().int().positive(), title: z.string(), author: z.object({ login: z.string() }).nullable(),
    isDraft: z.boolean(), state: z.enum(["OPEN", "CLOSED", "MERGED"]),
    reviewDecision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"]).nullable(),
    updatedAt: z.iso.datetime(), mergedAt: z.iso.datetime().nullable(),
    repository: z.object({ nameWithOwner: repositoryNameSchema }),
  })),
}) }) });
const query = `query Mailroom($search: String!, $after: String) {
  search(query: $search, type: ISSUE, first: 25, after: $after) {
    issueCount pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title author { login } isDraft state reviewDecision updatedAt mergedAt repository { nameWithOwner }
    } }
  }
}`;

export async function listGitHubRepositories(client: GitHubClient, token: string, page: number): Promise<GitHubRepositories> {
  const rows = z.array(repositorySchema).parse(await client.request(token, `/user/repos?sort=updated&per_page=50&page=${page}`));
  return { repositories: rows.map((row) => ({ fullName: row.full_name, private: row.private })), nextPage: rows.length === 50 ? page + 1 : null };
}

export async function readGitHubMailroom(client: GitHubClient, token: string, repository: string, view: GitHubMailroomView, cursor?: string): Promise<GitHubMailroom> {
  const name = repositoryNameSchema.parse(repository);
  const repo = repositorySchema.parse(await client.request(token, `/repos/${name}`));
  if (repo.full_name.toLowerCase() !== name.toLowerCase()) throw new GitHubError("GITHUB_ACCESS_DENIED", "Repository changed. Choose it again.", 403);
  const filter = { repository: "is:open", mine: "is:open author:@me", reviews: "is:open review-requested:@me", merged: "is:merged" }[view];
  const result = await client.request(token, "/graphql", { query, variables: { search: `repo:${name} is:pr ${filter} sort:updated-desc`, after: cursor ?? null } });
  if (z.object({ errors: z.array(z.unknown()).min(1) }).safeParse(result).success) {
    throw new GitHubError("GITHUB_QUERY_FAILED", "Pull requests could not be loaded. Check GitHub access and try again.", 502, 60);
  }
  const search = searchSchema.parse(result).data.search;
  if (search.nodes.some((row) => row.repository.nameWithOwner.toLowerCase() !== name.toLowerCase())) {
    throw new GitHubError("GITHUB_RESPONSE_INVALID", "Pull requests could not be loaded. Try again.", 502);
  }
  return {
    repository: { fullName: repo.full_name, private: repo.private }, total: search.issueCount,
    nextCursor: search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null,
    pullRequests: search.nodes.map((row) => ({ number: row.number, title: row.title,
      url: `https://github.com/${repo.full_name}/pull/${row.number}`, author: row.author?.login ?? null,
      draft: row.isDraft, state: row.state, reviewDecision: row.reviewDecision, updatedAt: row.updatedAt, mergedAt: row.mergedAt })),
  };
}
