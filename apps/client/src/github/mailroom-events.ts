import type { GitHubMailroom, GitHubMailroomView } from "@workhard/shared";

export function getMailroomArrival(previous: GitHubMailroom | undefined, next: GitHubMailroom, view: GitHubMailroomView) {
  if (!previous || previous.repository.fullName !== next.repository.fullName || view !== "merged") return undefined;
  const latest = Math.max(0, ...previous.pullRequests.map((pull) => Date.parse(pull.mergedAt ?? "") || 0));
  return next.pullRequests.find((pull) => pull.state === "MERGED" && pull.mergedAt && Date.parse(pull.mergedAt) > latest
    && !previous.pullRequests.some((old) => old.number === pull.number));
}
