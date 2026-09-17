import { describe, expect, it, vi } from "vitest";
import { createAuthenticationEmailDelivery } from "./email-delivery.js";

describe("authentication email delivery", () => {
  it("requires STARTTLS and sends escaped verification, recovery, and change emails", async () => {
    const sendMail = vi.fn(async (_message: { subject: string; text: string; html: string }) => undefined);
    const transportFactory = vi.fn(() => ({ sendMail }));
    const delivery = createAuthenticationEmailDelivery({ SMTP_HOST: "smtp.example.com", SMTP_FROM: "office@example.com" }, transportFactory)!;
    expect(transportFactory).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true, port: 587 }));
    await delivery.deliverRegistrationLink("person@example.com", "https://office.example.com/#registration=one", "Acme <Spaces>");
    await delivery.deliverPasswordReset("person@example.com", "https://office.example.com/#reset=one&invite=two", "Acme <Spaces>");
    await delivery.deliverPasswordChanged("person@example.com", "Acme <Spaces>");
    expect(sendMail.mock.calls[0]?.[0].subject).toBe("Verify your email for Acme <Spaces>");
    expect(sendMail.mock.calls[1]?.[0].html).toContain("reset=one&amp;invite=two");
    expect(sendMail.mock.calls[1]?.[0].html).toContain("Acme &lt;Spaces&gt;");
    expect(sendMail.mock.calls[2]?.[0].text).toContain("all sessions were signed out");
  });

  it("stays disabled when SMTP is not configured", () => {
    const transportFactory = vi.fn();

    expect(createAuthenticationEmailDelivery({
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
    }, transportFactory)).toBeUndefined();
    expect(transportFactory).not.toHaveBeenCalled();
  });

  it("configures authenticated implicit TLS delivery", async () => {
    const sendMail = vi.fn(async (_message: { html: string }) => undefined);
    const transportFactory = vi.fn(() => ({ sendMail }));
    const delivery = createAuthenticationEmailDelivery({
      SMTP_HOST: "smtp.example.com",
      SMTP_SECURE: "true",
      SMTP_USERNAME: "northstar",
      SMTP_PASSWORD: "secret value",
      SMTP_FROM: "Northstar <office@example.com>",
    }, transportFactory)!;

    await delivery.deliverMagicLink(
      "member@example.com",
      "https://office.example.com/auth/magic#magic=one&invite=two",
      "Acme <Spaces>\nTeam",
    );
    await delivery.deliverInvitation(
      "guest@example.com",
      "https://office.example.com/auth/invite#invite=three",
      "Acme Spaces",
    );

    expect(transportFactory).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      requireTLS: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: { user: "northstar", pass: "secret value" },
    });
    expect(sendMail).toHaveBeenNthCalledWith(1, expect.objectContaining({
      from: "Northstar <office@example.com>",
      to: "member@example.com",
      subject: "Sign in to Acme <Spaces> Team",
      text: expect.stringContaining("https://office.example.com/auth/magic#magic=one&invite=two"),
      html: expect.stringContaining("Acme &lt;Spaces&gt; Team"),
    }));
    expect(sendMail.mock.calls[0]?.[0].html).toContain("magic=one&amp;invite=two");
    expect(sendMail).toHaveBeenNthCalledWith(2, expect.objectContaining({
      to: "guest@example.com",
      subject: "Join Acme Spaces",
    }));
  });

  it.each([
    [{ SMTP_HOST: "smtp.example.com" }, "SMTP_HOST and SMTP_FROM"],
    [{ SMTP_FROM: "office@example.com" }, "SMTP_HOST and SMTP_FROM"],
    [{ SMTP_HOST: "smtp.example.com", SMTP_FROM: "office@example.com", SMTP_USERNAME: "user" }, "SMTP_USERNAME and SMTP_PASSWORD"],
    [{ SMTP_HOST: "smtp.example.com", SMTP_FROM: "office@example.com", SMTP_PORT: "zero" }, "SMTP_PORT"],
    [{ SMTP_HOST: "smtp.example.com", SMTP_FROM: "office@example.com", SMTP_SECURE: "sometimes" }, "SMTP_SECURE"],
  ])("rejects invalid SMTP configuration", (environment, message) => {
    expect(() => createAuthenticationEmailDelivery(environment, vi.fn())).toThrow(message);
  });
});
