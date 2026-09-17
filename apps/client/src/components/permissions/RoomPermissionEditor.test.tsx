import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, DEFAULT_CHARACTER_APPEARANCE, DEFAULT_GAME_SETTINGS, type Member, type Room } from "@workhard/shared";
import { RoomPermissionEditor } from "./RoomPermissionEditor";

afterEach(cleanup);
const members: Member[] = ["Lead", "Member"].map((name) => ({ id: name, name, initials: name[0]!, character: DEFAULT_CHARACTER_APPEARANCE,
  email: `${name}@example.test`, title: "", role: "member", permissions: [], color: "#445566", availability: "available", online: false }));
const organisation = { ...createOrganisation(), units: [{ id: "team", name: "Engineering", kind: "team" as const, parentId: null }],
  assignments: [{ userId: "Lead", unitId: "team", rank: "lead" as const }, { userId: "Member", unitId: "team", rank: "member" as const }] };
const room: Room = { id: "room", floorId: "floor", name: "Studio", color: "#ffffff", capacity: 4,
  bounds: { x: 0, y: 0, width: 128, height: 128 }, footprint: [{ x: 0, y: 0, width: 128, height: 128 }], boundary: [], doorIds: ["door"], windowIds: [], privateEligible: true,
  access: { mode: "open", assignedPersonIds: [], knockable: false }, organisationUnitId: "team" };

describe("room access and build editor", () => {
  it("proposes enabling a meeting room and shows the consequence when disabling it", () => {
    const onSave = vi.fn();
    const props = { room, members, organisation, settings: DEFAULT_GAME_SETTINGS, editable: true, canAssignUnit: true, pending: false, onSave };
    const { rerender } = render(<RoomPermissionEditor {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Meeting room" }));
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ meetingRoom: true }));
    rerender(<RoomPermissionEditor {...props} room={{ ...room, meetingRoom: true }} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Meeting room" }));
    expect(screen.getByText("Turning this off ends the room call.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ meetingRoom: false }));
  });

  it("previews and saves entry separately from lead-only building", () => {
    const onSave = vi.fn();
    render(<RoomPermissionEditor room={room} members={members} organisation={organisation} settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={onSave} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Build" }), { target: { value: "assigned" } });
    const build = screen.getByRole("group", { name: "Build" });
    fireEvent.click(within(build).getByText("Organisation", { exact: true }));
    fireEvent.change(within(build).getByRole("combobox", { name: "Engineering build" }), { target: { value: "leads" } });
    fireEvent.click(screen.getByText("Preview", { exact: true }));
    expect(within(screen.getByRole("row", { name: "Lead Yes Yes" })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Yes", "Yes"]);
    expect(screen.getByRole("row", { name: "Member Yes No" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId: "team", rank: "leads", descendants: true }] },
    }));
    fireEvent.change(screen.getByRole("combobox", { name: "Access" }), { target: { value: "none" } });
    expect(screen.getByRole("row", { name: "Lead No No" })).toBeTruthy();
  });

  it("blocks saving private access without a door and prevents read-only edits", () => {
    const props = { room: { ...room, privateEligible: false }, members, organisation, settings: DEFAULT_GAME_SETTINGS, editable: true, canAssignUnit: true, pending: false, onSave: vi.fn() };
    const { rerender } = render(<RoomPermissionEditor {...props} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Access" }), { target: { value: "assigned" } });
    expect(screen.getByRole("alert").textContent).toBe("Add a door before restricting access.");
    expect((screen.getByRole("button", { name: "Propose changes" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RoomPermissionEditor {...props} editable={false} />);
    expect(screen.queryByRole("button", { name: "Propose changes" })).toBeNull();
    expect(screen.getByLabelText("Name").closest("fieldset")!.disabled).toBe(true);
  });
});
