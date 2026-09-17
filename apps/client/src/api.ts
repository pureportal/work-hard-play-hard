import type {
  AuthUser,
  BootstrapData,
  ChatMessage,
  CharacterAppearance,
  Conversation,
  CorporateIdentity,
  CorporateIdentitySettings,
  Invitation,
  Member,
  MemberRole,
  RegistrationAvailability,
  RegistrationSettings,
  SpotifyStatus,
  SpotifyAdminSettings,
  SpotifyAppSettings,
  GitHubStatus,
  GitHubAdminSettings,
  GitHubAppSettingsUpdate,
  GitHubRepositories,
  GitHubMailroom,
  GitHubMailroomView,
} from "@workhard/shared";
import { resolveServerUrl } from "./server-url";

const REQUEST_TIMEOUT_MS = 10_000;
const EMAIL_DELIVERY_TIMEOUT_MS = 45_000;
const UPLOAD_TIMEOUT_MS = 45_000;
const SPOTIFY_REQUEST_TIMEOUT_MS = 30_000;

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isConnectionError(error: unknown): error is ConnectionError | ApiError {
  return error instanceof ConnectionError
    || (error instanceof ApiError && [408, 502, 503, 504].includes(error.status));
}

interface AuthResponse {
  user: AuthUser;
}

interface SessionResponse {
  user: AuthUser | null;
  setupRequired: boolean;
  registration: RegistrationAvailability;
  magicLinkEnabled: boolean;
  passwordResetEnabled: boolean;
  corporateIdentity: CorporateIdentity;
}

export interface AuthSession {
  user: AuthUser | undefined;
  setupRequired: boolean;
  registration: RegistrationAvailability;
  magicLinkEnabled: boolean;
  passwordResetEnabled: boolean;
  corporateIdentity: CorporateIdentity;
}

interface MagicLinkResponse {
  message: string;
  magicLink?: string;
}

export type RegistrationResponse = { user: AuthUser } | { verificationRequired: true; registrationLink?: string };

export interface IssuedInvitation extends Invitation {
  inviteLink?: string;
}

export async function fetchSession(): Promise<AuthSession> {
  const response = await fetchWithTimeout("/v1/auth/session", { cache: "no-store" });
  const session = await readResponse<SessionResponse>(response);
  return {
    user: session.user ?? undefined,
    setupRequired: session.setupRequired,
    registration: session.registration,
    magicLinkEnabled: session.magicLinkEnabled,
    passwordResetEnabled: session.passwordResetEnabled,
    corporateIdentity: session.corporateIdentity,
  };
}

export async function registerAccount(
  username: string,
  email: string,
  password: string,
  invitationToken?: string,
): Promise<RegistrationResponse> {
  const response = await fetchWithTimeout("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password, ...(invitationToken ? { invitationToken } : {}) }),
  }, EMAIL_DELIVERY_TIMEOUT_MS);
  return readResponse<RegistrationResponse>(response);
}

export async function login(identifier: string, password: string): Promise<AuthUser> {
  const response = await fetchWithTimeout("/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  return (await readResponse<AuthResponse>(response)).user;
}

export async function requestMagicLink(email: string, invitationToken?: string): Promise<MagicLinkResponse> {
  const response = await fetchWithTimeout("/v1/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, ...(invitationToken ? { invitationToken } : {}) }),
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

export async function verifyRegistrationLink(token: string): Promise<AuthUser> {
  const response = await fetchWithTimeout("/v1/auth/register/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return (await readResponse<AuthResponse>(response)).user;
}

export async function requestPasswordReset(email: string, invitationToken?: string): Promise<{ message: string; resetLink?: string }> {
  const response = await fetchWithTimeout("/v1/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, ...(invitationToken ? { invitationToken } : {}) }),
  });
  return readResponse(response);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const response = await fetchWithTimeout("/v1/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  await readResponse(response);
}

export async function logout(): Promise<void> {
  const response = await fetchWithTimeout("/v1/auth/logout", { method: "POST" });
  await readResponse<{ signedOut: boolean }>(response, "Could not sign out.");
}

export async function fetchBootstrap(): Promise<BootstrapData> {
  const response = await fetchWithTimeout("/v1/bootstrap", { cache: "no-store" });
  return readResponse<BootstrapData>(response, "Office could not be loaded.");
}

export async function fetchSpotifyStatus(): Promise<SpotifyStatus> {
  return readResponse<SpotifyStatus>(await fetchWithTimeout("/v1/spotify", { cache: "no-store" }));
}

export async function fetchSpotifyAdminSettings(): Promise<SpotifyAdminSettings> {
  return readResponse<SpotifyAdminSettings>(await fetchWithTimeout("/v1/admin/spotify", { cache: "no-store" }));
}

export async function updateSpotifyAdminSettings(settings: SpotifyAppSettings): Promise<SpotifyAdminSettings> {
  return readResponse<SpotifyAdminSettings>(await fetchWithTimeout("/v1/admin/spotify", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
  }));
}

export async function fetchGitHubStatus(): Promise<GitHubStatus> {
  return readResponse<GitHubStatus>(await fetchWithTimeout("/v1/github", { cache: "no-store" }));
}

export async function fetchGitHubAdminSettings(): Promise<GitHubAdminSettings> {
  return readResponse<GitHubAdminSettings>(await fetchWithTimeout("/v1/admin/github", { cache: "no-store" }));
}

export async function updateGitHubAdminSettings(settings: GitHubAppSettingsUpdate): Promise<GitHubAdminSettings> {
  return readResponse<GitHubAdminSettings>(await fetchWithTimeout("/v1/admin/github", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
  }, 35_000));
}

export async function connectGitHub(): Promise<string> {
  const response = await fetchWithTimeout("/v1/github/connect", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  return (await readResponse<{ url: string }>(response)).url;
}

export async function disconnectGitHub(): Promise<GitHubStatus> {
  return readResponse<GitHubStatus>(await fetchWithTimeout("/v1/github", { method: "DELETE" }));
}

export async function fetchGitHubRepositories(page: number, signal?: AbortSignal): Promise<GitHubRepositories> {
  return readResponse<GitHubRepositories>(await fetchWithTimeout(`/v1/github/repositories?page=${page}`, { cache: "no-store", ...(signal ? { signal } : {}) }, 35_000));
}

export async function fetchGitHubMailroom(objectId: string, repository: string, view: GitHubMailroomView, cursor: string | null, signal?: AbortSignal): Promise<GitHubMailroom> {
  const query = new URLSearchParams({ repository, view, ...(cursor ? { cursor } : {}) });
  return readResponse<GitHubMailroom>(await fetchWithTimeout(`/v1/github/trays/${encodeURIComponent(objectId)}?${query}`, { cache: "no-store", ...(signal ? { signal } : {}) }, 35_000));
}

export async function connectSpotify(): Promise<string> {
  const response = await fetchWithTimeout("/v1/spotify/connect", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  return (await readResponse<{ url: string }>(response)).url;
}

export async function disconnectSpotify(): Promise<SpotifyStatus> {
  return readResponse<SpotifyStatus>(await fetchWithTimeout("/v1/spotify", { method: "DELETE" }, SPOTIFY_REQUEST_TIMEOUT_MS));
}

export async function setSpotifySharing(sharing: boolean): Promise<SpotifyStatus> {
  return readResponse<SpotifyStatus>(await fetchWithTimeout("/v1/spotify/sharing", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sharing }),
  }, SPOTIFY_REQUEST_TIMEOUT_MS));
}

export async function setSpotifyJam(url: string | null): Promise<SpotifyStatus> {
  return readResponse<SpotifyStatus>(await fetchWithTimeout("/v1/spotify/jam", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
  }));
}

export async function playSpotifySong(targetUserId: string, trackId: string): Promise<void> {
  await readResponse(await fetchWithTimeout("/v1/spotify/play", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetUserId, trackId }),
  }, SPOTIFY_REQUEST_TIMEOUT_MS));
}

export async function inviteMember(
  teamId: string,
  email: string,
  role: Exclude<MemberRole, "owner"> = "member",
): Promise<IssuedInvitation> {
  const response = await fetchWithTimeout(`/v1/teams/${encodeURIComponent(teamId)}/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, role }),
  }, EMAIL_DELIVERY_TIMEOUT_MS);
  return readResponse<IssuedInvitation>(response, "Invitation could not be sent.");
}

export async function acceptInvitation(token: string): Promise<Invitation> {
  const response = await fetchWithTimeout("/v1/invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return readResponse<Invitation>(response, "Invitation could not be accepted.");
}

export async function revokeInvitation(teamId: string, invitationId: string): Promise<Invitation> {
  const response = await fetchWithTimeout(
    `/v1/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "DELETE",
    },
  );
  return readResponse<Invitation>(response, "Invitation could not be revoked.");
}

export async function changeMemberAccess(
  teamId: string,
  memberId: string,
  role: Exclude<MemberRole, "owner">,
): Promise<Member> {
  const response = await fetchWithTimeout(
    `/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  return readResponse<Member>(response, "Access could not be changed.");
}

export async function fetchRegistrationSettings(): Promise<RegistrationSettings> {
  return readResponse<RegistrationSettings>(await fetchWithTimeout("/v1/admin/registration-settings"), "Registration settings could not load.");
}

export async function updateRegistrationSettings(settings: RegistrationSettings): Promise<RegistrationSettings> {
  const response = await fetchWithTimeout("/v1/admin/registration-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  return readResponse<RegistrationSettings>(response, "Registration settings could not be saved.");
}

export async function updateCorporateIdentity(settings: CorporateIdentitySettings): Promise<CorporateIdentity> {
  const response = await fetchWithTimeout("/v1/admin/corporate-identity", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  return readResponse<CorporateIdentity>(response, "Corporate identity could not be saved.");
}

export async function uploadCorporateLogo(file: File): Promise<CorporateIdentity> {
  const response = await fetchWithTimeout("/v1/admin/corporate-identity/logo", {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  }, UPLOAD_TIMEOUT_MS);
  return readResponse<CorporateIdentity>(response, "Logo could not be updated.");
}

export async function removeCorporateLogo(): Promise<CorporateIdentity> {
  const response = await fetchWithTimeout("/v1/admin/corporate-identity/logo", { method: "DELETE" });
  return readResponse<CorporateIdentity>(response, "Logo could not be removed.");
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

export async function uploadWhiteboardImage(objectId: string, file: File): Promise<string> {
  const response = await fetchWithTimeout(`/v1/whiteboards/${encodeURIComponent(objectId)}/images`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  }, UPLOAD_TIMEOUT_MS);
  const result = await readResponse<{ url: string }>(response, "Image could not be uploaded. Try again.");
  return result.url;
}

export async function updatePlayerCharacter(appearance: CharacterAppearance): Promise<Member> {
  const response = await fetchWithTimeout("/v1/members/me/character", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appearance),
  });
  return readResponse<Member>(response, "Character could not be saved. Try again.");
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
    try {
      return await response.json() as T;
    } catch {
      throw new Error("Server returned an invalid response.");
    }
  }
  const error = await response.json().catch(() => undefined) as { code?: string; message?: string } | undefined;
  throw new ApiError(error?.message ?? fallback, response.status, error?.code);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const sourceSignal = init.signal;
  let timedOut = false;
  const abortFromSource = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) {
    abortFromSource();
  } else {
    sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
  }
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const requestUrl = typeof input === "string" && input.startsWith("/") ? resolveServerUrl(input) : input;
    return await fetch(requestUrl, {
      ...init,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (error) {
    if (sourceSignal?.aborted) {
      throw error;
    }
    if (timedOut) {
      throw new ConnectionError("Request timed out.");
    }
    if (!navigator.onLine) {
      throw new ConnectionError("Connection unavailable.");
    }
    throw new ConnectionError("Server could not be reached.");
  } finally {
    window.clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  }
}
