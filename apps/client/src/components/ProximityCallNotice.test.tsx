import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Member } from "@workhard/shared";
import { ProximityCallNotice } from "./ProximityCallNotice";

const participants: Member[] = [
  {
    id: "maya",
    name: "Maya Chen",
    initials: "MC",
    email: "maya@example.com",
    title: "Product Lead",
    role: "owner",
    permissions: ["manage_members", "build"],
    color: "#ff7a66",
    availability: "available",
    online: true,
  },
  {
    id: "leo",
    name: "Leo Martins",
    initials: "LM",
    email: "leo@example.com",
    title: "Design Engineer",
    role: "member",
    permissions: [],
    color: "#5b8def",
    availability: "available",
    online: true,
  },
];

afterEach(cleanup);

describe("ProximityCallNotice", () => {
  it("names the current nearby participants", () => {
    const view = render(<ProximityCallNotice participants={participants} />);

    expect(view.getByRole("status", { name: "Nearby with Maya, Leo" })).toBeTruthy();
    expect(view.getByText("Maya, Leo")).toBeTruthy();
  });
});
