import { createTransport } from "nodemailer";

const DEFAULT_SMTP_PORT = 587;

export interface AuthenticationEmailDelivery {
  deliverMagicLink(email: string, link: string, applicationName: string): Promise<void>;
  deliverInvitation(email: string, link: string, applicationName: string): Promise<void>;
  deliverRegistrationLink(email: string, link: string, applicationName: string): Promise<void>;
  deliverPasswordReset(email: string, link: string, applicationName: string): Promise<void>;
  deliverPasswordChanged(email: string, applicationName: string): Promise<void>;
}

interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface EmailTransport {
  sendMail(message: EmailMessage): Promise<unknown>;
}

interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  auth?: {
    user: string;
    pass: string;
  };
}

type SmtpTransportFactory = (options: SmtpTransportOptions) => EmailTransport;

const defaultTransportFactory: SmtpTransportFactory = (options) => {
  const transport = createTransport(options);
  return {
    sendMail: (message) => transport.sendMail(message),
  };
};

export function createAuthenticationEmailDelivery(
  environment: NodeJS.ProcessEnv = process.env,
  transportFactory: SmtpTransportFactory = defaultTransportFactory,
): AuthenticationEmailDelivery | undefined {
  const host = environment.SMTP_HOST?.trim();
  const from = environment.SMTP_FROM?.trim();
  const username = environment.SMTP_USERNAME?.trim();
  const password = environment.SMTP_PASSWORD;
  if (!host && !from && !username && !password) {
    return undefined;
  }
  if (!host || !from) {
    throw new Error("SMTP_HOST and SMTP_FROM are required when email delivery is configured.");
  }
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("SMTP_USERNAME and SMTP_PASSWORD must be configured together.");
  }

  const secure = parseSmtpSecure(environment.SMTP_SECURE);
  const port = parseSmtpPort(environment.SMTP_PORT, secure);
  const transport = transportFactory({
    host,
    port,
    secure,
    requireTLS: !secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(username && password ? { auth: { user: username, pass: password } } : {}),
  });

  return {
    async deliverMagicLink(email, link, applicationName) {
      const name = normalizeApplicationName(applicationName);
      await transport.sendMail({
        from,
        to: email,
        subject: `Sign in to ${name}`,
        text: `Sign in to ${name}:\n\n${link}`,
        html: `<p><a href="${escapeHtml(link)}">Sign in to ${escapeHtml(name)}</a></p>`,
      });
    },
    async deliverInvitation(email, link, applicationName) {
      const name = normalizeApplicationName(applicationName);
      await transport.sendMail({
        from,
        to: email,
        subject: `Join ${name}`,
        text: `Join ${name}:\n\n${link}`,
        html: `<p><a href="${escapeHtml(link)}">Join ${escapeHtml(name)}</a></p>`,
      });
    },
    async deliverRegistrationLink(email, link, applicationName) {
      const name = normalizeApplicationName(applicationName);
      await transport.sendMail({
        from,
        to: email,
        subject: `Verify your email for ${name}`,
        text: `Complete your ${name} registration:\n\n${link}\n\nThis link expires in 15 minutes.`,
        html: `<p><a href="${escapeHtml(link)}">Complete your ${escapeHtml(name)} registration</a></p><p>This link expires in 15 minutes.</p>`,
      });
    },
    async deliverPasswordReset(email, link, applicationName) {
      const name = normalizeApplicationName(applicationName);
      await transport.sendMail({
        from,
        to: email,
        subject: `Reset your ${name} password`,
        text: `Reset your ${name} password:\n\n${link}\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.`,
        html: `<p><a href="${escapeHtml(link)}">Reset your ${escapeHtml(name)} password</a></p><p>This link expires in 15 minutes. If you did not request it, ignore this email.</p>`,
      });
    },
    async deliverPasswordChanged(email, applicationName) {
      const name = normalizeApplicationName(applicationName);
      await transport.sendMail({
        from,
        to: email,
        subject: `Your ${name} password was changed`,
        text: `Your ${name} password was changed and all sessions were signed out. If this was not you, reset your password or contact the workspace owner.`,
        html: `<p>Your ${escapeHtml(name)} password was changed and all sessions were signed out. If this was not you, reset your password or contact the workspace owner.</p>`,
      });
    },
  };
}

function parseSmtpSecure(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "false") {
    return false;
  }
  if (normalized === "true") {
    return true;
  }
  throw new Error("SMTP_SECURE must be true or false.");
}

function parseSmtpPort(value: string | undefined, secure: boolean): number {
  const normalized = value?.trim();
  if (!normalized) {
    return secure ? 465 : DEFAULT_SMTP_PORT;
  }
  if (!/^\d+$/.test(normalized)) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }
  const port = Number(normalized);
  if (port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function normalizeApplicationName(applicationName: string): string {
  return applicationName.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
