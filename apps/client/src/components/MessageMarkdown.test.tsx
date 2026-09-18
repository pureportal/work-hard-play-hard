import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageMarkdown } from "./MessageMarkdown";

afterEach(cleanup);

describe("MessageMarkdown", () => {
  it("renders formatting, lists, quotes, code, and chat line breaks", () => {
    const view = render(<MessageMarkdown text={'## Plan\n\n**Bold** and *italic* and ~~removed~~ with `code`\nNext line\n\n- First\n- Second\n\n> Quoted\n\n```js\nconst value = "<tag>";\n```'} />);
    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
    expect(view.container.querySelector("strong")?.textContent).toBe("Bold");
    expect(view.container.querySelector("em")?.textContent).toBe("italic");
    expect(view.container.querySelector("del")?.textContent).toBe("removed");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(view.container.querySelector("blockquote")?.textContent).toContain("Quoted");
    expect(view.container.querySelector("pre code")?.textContent).toBe('const value = "<tag>";\n');
    expect(view.container.querySelector("br")).toBeTruthy();
  });

  it("renders tables and read-only task lists", () => {
    render(<MessageMarkdown text={'| Task | Status |\n| --- | --- |\n| Review | Done |\n\n- [x] Finished\n- [ ] Pending'} />);
    expect(screen.getByRole("table")).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.map((input) => input.checked)).toEqual([true, false]);
    expect(checkboxes.every((input) => input.disabled)).toBe(true);
  });

  it("opens explicit links and plain URLs safely without bubbling clicks", () => {
    const onClick = vi.fn();
    render(<div onClick={onClick}><MessageMarkdown text="[Docs](https://example.com/docs) and https://example.com/review." /></div>);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://example.com/docs", "https://example.com/review"]);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    fireEvent.click(links[0]!);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not execute HTML, load Markdown images, or link unsafe URLs", () => {
    const view = render(<MessageMarkdown text={'<script>alert(1)</script>\n\n<img src="https://example.com/tracker" onerror="alert(1)">\n\n![Diagram](https://example.com/tracker.png)\n\n[Run](javascript:alert%281%29) [Data](data:text/html,test) [Credentials](https://user:pass@example.com) [Relative](/settings)'} />);
    expect(view.container.querySelector("script, img, a")).toBeNull();
    expect(screen.getByText("Diagram")).toBeTruthy();
    expect(view.container.textContent).toContain("Run");
  });
});
