import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkedText } from "./LinkedText";

afterEach(cleanup);

describe("shared text links", () => {
  it("keeps punctuation and multiline text while opening safe links without referrers", () => {
    const click = vi.fn();
    const text = "Review (https://github.com/team/repo/pull/12).\nThen https://example.com/a_(b)!";
    const view = render(<div onClick={click}><LinkedText text={text} /></div>);
    const links = view.getAllByRole("link") as HTMLAnchorElement[];
    expect(links.map((link) => link.href)).toEqual(["https://github.com/team/repo/pull/12", "https://example.com/a_(b)"]);
    expect(view.container.textContent).toBe(text);
    expect(links[0]!.rel).toBe("noopener noreferrer");
    fireEvent.click(links[0]!);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves executable schemes, malformed URLs, credentials and markup as text", () => {
    const text = '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,test https://user:pass@evil.example https://';
    const view = render(<LinkedText text={text} />);
    expect(view.queryAllByRole("link")).toEqual([]);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toBe(text);
  });
});
