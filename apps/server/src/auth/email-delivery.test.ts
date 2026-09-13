import { describe, expect, it, vi } from "vitest";
import { createAuthenticationEmailDelivery } from "./email-delivery.js";

describe("authentication email delivery", () => {
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
