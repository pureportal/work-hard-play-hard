import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationSettingsEditor } from "./RegistrationSettingsEditor";

afterEach(cleanup);

describe("RegistrationSettingsEditor", () => {
  it("edits every registration setting", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RegistrationSettingsEditor
        settings={{
          enabled: false,
          invitationRequired: true,
          whitelistedDomains: ["old.example.com"],
          defaultRole: "member",
        }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Allow registrations" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Require invitation" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Default role" }), { target: { value: "guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove old.example.com" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Domains without invitations" }), {
      target: { value: " Trusted.Example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      enabled: true,
      invitationRequired: false,
      whitelistedDomains: ["trusted.example.com"],
      defaultRole: "guest",
    }));
  });

  it("rejects invalid and duplicate domains before saving", () => {
    render(
      <RegistrationSettingsEditor
        settings={{
          enabled: true,
          invitationRequired: true,
          whitelistedDomains: ["example.com"],
          defaultRole: "member",
        }}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Domains without invitations" }), {
      target: { value: "not a domain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email domain.");

    fireEvent.change(screen.getByRole("textbox", { name: "Domains without invitations" }), {
      target: { value: "EXAMPLE.COM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe("Domain is already listed.");
  });
});
