import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorporateIdentityEditor } from "./CorporateIdentityEditor";

afterEach(cleanup);

describe("CorporateIdentityEditor", () => {
  it("saves identity settings and uploads a supported logo", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onLogoUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <CorporateIdentityEditor
        identity={{
          applicationName: "Northstar",
          primaryColor: "#6757e8",
          secondaryColor: "#ee9571",
          authenticationLayout: "split",
        }}
        onSave={onSave}
        onLogoUpload={onLogoUpload}
        onLogoRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Application name" }), { target: { value: "Acme Spaces" } });
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#123abc" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Login layout" }), { target: { value: "centered" } });
    fireEvent.click(screen.getByRole("button", { name: "Save identity" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      applicationName: "Acme Spaces",
      primaryColor: "#123abc",
      secondaryColor: "#ee9571",
      authenticationLayout: "centered",
    }));

    const logo = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [logo] } });
    await waitFor(() => expect(onLogoUpload).toHaveBeenCalledWith(logo));
  });
});
