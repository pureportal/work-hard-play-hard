import type { AuthUser, BootstrapData, ChatMessage, Conversation, Invitation, Member, MemberRole } from "@workhard/shared";

const REQUEST_TIMEOUT_MS = 7_000;
const UPLOAD_TIMEOUT_MS = 15_000;

interface AuthResponse {
  user: AuthUser;
}

interface SessionResponse {
  user: AuthUser | null;
}

interface MagicLinkResponse {
  message: string;
  magicLink?: string;
}

export async function fetchSession(): Promise<AuthUser | undefined> {
  const response = await fetchWithTimeout("/v1/auth/session");
  return (await readResponse<SessionResponse>(response)).user ?? undefined;
}

export async function registerAccount(username: string, email: string, password: string): Promise<AuthUser> {
  const response = await fetchWithTimeout("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  return (await readResponse<AuthResponse>(response)).user;
}

export async function login(identifier: string, password: string): Promise<AuthUser> {
  const response = await fetchWithTimeout("/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  return (await readResponse<AuthResponse>(response)).user;
}

export async function requestMagicLink(email: string): Promise<MagicLinkResponse> {
  const response = await fetchWithTimeout("/v1/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return readResponse<MagicLinkResponse>(response);
}

export async function verifyMagicLink(token: string): Promise<AuthUser> {
  const response = await fetchWithTimeout("/v1/auth/magic-link/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return (await readResponse<AuthResponse>(response)).user;
}

export async function logout(): Promise<void> {
  const response = await fetchWithTimeout("/v1/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not sign out.");
  }
}

export async function fetchBootstrap(): Promise<BootstrapData> {
  const response = await fetchWithTimeout("/v1/bootstrap");
  return readResponse<BootstrapData>(response, "Office could not be loaded.");
}

export async function inviteMember(
  teamId: string,
  email: string,
  role: Exclude<MemberRole, "owner"> = "member",
): Promise<Invitation> {
  const response = await fetchWithTimeout(`/v1/teams/${teamId}/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  return readResponse<Invitation>(response, "Invitation could not be sent.");
}

export async function revokeInvitation(teamId: string, invitationId: string): Promise<Invitation> {
  const response = await fetchWithTimeout(`/v1/teams/${teamId}/invitations/${invitationId}`, {
    method: "DELETE",
  });
  return readResponse<Invitation>(response, "Invitation could not be revoked.");
}

export async function changeMemberRole(
  teamId: string,
  memberId: string,
  role: Exclude<MemberRole, "owner">,
): Promise<Member> {
  const response = await fetchWithTimeout(`/v1/teams/${teamId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return readResponse<Member>(response, "Role could not be changed.");
}

export async function uploadChatImage(conversationId: string, file: File): Promise<ChatMessage> {
  const response = await fetchWithTimeout(`/v1/conversations/${encodeURIComponent(conversationId)}/images`, {
    method: "POST",
    headers: {
      "content-type": file.type,
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
  }, UPLOAD_TIMEOUT_MS);
  return readResponse<ChatMessage>(response, "Image could not be sent.");
}

export async function createDirectConversation(targetUserId: string): Promise<Conversation> {
  const response = await fetchWithTimeout("/v1/conversations/direct", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetUserId }),
  });
  return readResponse<Conversation>(response, "Conversation could not be opened.");
}

async function readResponse<T>(response: Response, fallback = "Request failed."): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }
  const error = await response.json().catch(() => undefined) as { message?: string } | undefined;
  throw new Error(error?.message ?? fallback);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Network request timed out.");
    }
    throw error;
  }
}
