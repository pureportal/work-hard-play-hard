import { DEFAULT_CORPORATE_IDENTITY } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import { applyCorporateIdentity, contrastingTextColor } from "./branding";
import { setServerOrigin } from "./server-url";

describe("appearance metadata", () => {
  let originalHead: string;
  let originalStyle: string | null;

  beforeEach(() => {
    originalHead = document.head.innerHTML;
    originalStyle = document.documentElement.getAttribute("style");
    document.head.innerHTML = new DOMParser().parseFromString(indexHtml, "text/html").head.innerHTML;
    localStorage.clear();
  });

  afterEach(() => {
    document.head.innerHTML = originalHead;
    if (originalStyle === null) document.documentElement.removeAttribute("style");
    else document.documentElement.setAttribute("style", originalStyle);
    localStorage.clear();
  });

  it("uses the default appearance in the initial document", () => {
    expect(document.title).toBe(DEFAULT_CORPORATE_IDENTITY.applicationName);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content"))
      .toBe(DEFAULT_CORPORATE_IDENTITY.primaryColor);
  });

  it("keeps metadata and icons in sync when appearance changes and the logo is removed", () => {
    const defaultIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
    setServerOrigin("https://office.example.com");

    for (const version of ["one", "two"]) {
      const identity = {
        ...DEFAULT_CORPORATE_IDENTITY,
        applicationName: `Acme & Partners ${version}`,
        primaryColor: version === "one" ? "#123abc" : "#abcdef",
        logoUrl: `/v1/branding/logo.webp?v=${version}`,
      };
      applyCorporateIdentity(identity);

      expect(document.title).toBe(identity.applicationName);
      for (const [name, content] of Object.entries({
        "application-name": identity.applicationName,
        "apple-mobile-web-app-title": identity.applicationName,
        description: `${identity.applicationName} virtual office`,
        "theme-color": identity.primaryColor,
      })) {
        const elements = document.head.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`);
        expect(elements).toHaveLength(1);
        expect(elements[0]!.content).toBe(content);
      }
      expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href)
        .toBe(`https://office.example.com/v1/branding/logo.webp?v=${version}`);
    }

    applyCorporateIdentity(DEFAULT_CORPORATE_IDENTITY);
    expect(document.title).toBe(DEFAULT_CORPORATE_IDENTITY.applicationName);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content"))
      .toBe("Northstar virtual office");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content"))
      .toBe(DEFAULT_CORPORATE_IDENTITY.primaryColor);
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href).toBe(defaultIcon);
  });

  it("creates missing metadata without requiring a favicon", () => {
    document.head.replaceChildren();
    applyCorporateIdentity({ ...DEFAULT_CORPORATE_IDENTITY, applicationName: "Acme <Office>" });

    expect(document.title).toBe("Acme <Office>");
    expect(document.querySelector('meta[name="application-name"]')?.getAttribute("content"))
      .toBe("Acme <Office>");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content"))
      .toBe("Acme <Office> virtual office");
    expect(document.querySelector("office")).toBeNull();
  });
});

describe("brand color contrast", () => {
  it("selects readable text for dark and light brand colors", () => {
    expect(contrastingTextColor("#6757e8")).toBe("#ffffff");
    expect(contrastingTextColor("#f2d94e")).toBe("#171821");
  });
});
