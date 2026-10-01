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
  it("starts with presets and hides detailed grants and area geometry", () => {
    render(<RoomPermissionEditor room={room} members={members} organisation={organisation} settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={vi.fn()} />);
    expect((screen.getByRole("combobox", { name: "Room type" }) as HTMLSelectElement).value).toBe("shared");
    expect(screen.queryByRole("combobox", { name: "Access" })).toBeNull();
    expect(screen.queryByRole("img", { name: /Personal areas/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByRole("combobox", { name: "Access" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Personal areas/ })).toBeTruthy();
  });

  it("gives a personal room private entry, owner building and direct furnishing", () => {
    const onSave = vi.fn();
    render(<RoomPermissionEditor room={room} members={members} organisation={organisation} settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={onSave} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Room type" }), { target: { value: "personal" } });
    expect((screen.getByRole("button", { name: "Propose changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Room owner" }), { target: { value: "Member" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "Member", ownerBuildApproval: "direct", meetingRoom: false,
      access: { mode: "assigned", assignedPersonIds: ["Member"], knockable: true }, build: { mode: "assigned", assignedPersonIds: ["Member"] } }));
  });

  it("does not offer private presets for rooms without doors and preserves custom settings when renaming", () => {
    const onSave = vi.fn();
    render(<RoomPermissionEditor room={{ ...room, privateEligible: false, build: { mode: "none", assignedPersonIds: [] } }} members={members} organisation={organisation} settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={onSave} />);
    expect((screen.getByRole("option", { name: "Personal room" }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Room type" }) as HTMLSelectElement).value).toBe("custom");
    fireEvent.change(screen.getByRole("combobox", { name: "Room type" }), { target: { value: "custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed", build: { mode: "none", assignedPersonIds: [] } }));
  });

  it("proposes enabling a meeting room and shows the consequence when disabling it", () => {
    const onSave = vi.fn();
    const props = { room, members, organisation, settings: DEFAULT_GAME_SETTINGS, editable: true, canAssignUnit: true, pending: false, onSave };
    const { rerender } = render(<RoomPermissionEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Room type" }), { target: { value: "meeting" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ meetingRoom: true }));
    rerender(<RoomPermissionEditor {...props} room={{ ...room, meetingRoom: true }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Room type" }), { target: { value: "shared" } });
    expect(screen.getByText("Turning this off ends the room call.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ meetingRoom: false }));
  });

  it("requires approval when assigning an owner to a room without a door", () => {
    const onSave = vi.fn();
    render(<RoomPermissionEditor room={{ ...room, privateEligible: false }} members={members} organisation={organisation}
      settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Room owner" }), { target: { value: "Member" } });
    expect((screen.getByRole("combobox", { name: "Owner's furnishing" }) as HTMLSelectElement).value).toBe("vote");
    expect((screen.getByRole("option", { name: "Apply directly" }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "Member", ownerBuildApproval: "vote" }));
  });

  it("previews and saves entry separately from lead-only building", () => {
    const onSave = vi.fn();
    render(<RoomPermissionEditor room={room} members={members} organisation={organisation} settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Access" }), { target: { value: "assigned" } });
    expect(screen.getByRole("alert").textContent).toBe("Add a door before restricting access.");
    expect((screen.getByRole("button", { name: "Propose changes" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RoomPermissionEditor {...props} editable={false} />);
    expect(screen.queryByRole("button", { name: "Propose changes" })).toBeNull();
    expect(screen.getByLabelText("Name").closest("fieldset")!.disabled).toBe(true);
    expect(screen.getByRole("combobox", { name: "Access" }).matches(":disabled")).toBe(true);
  });

  it("only offers people with entry access for building and lets an owner skip votes", () => {
    const onSave = vi.fn();
    render(<RoomPermissionEditor room={room} members={members} organisation={organisation} settings={DEFAULT_GAME_SETTINGS} editable canAssignUnit pending={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Access" }), { target: { value: "assigned" } });
    const access = screen.getByRole("group", { name: "Access" });
    fireEvent.click(within(access).getByText("People", { exact: true }));
    fireEvent.click(within(access).getByRole("checkbox", { name: "Lead" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Build" }), { target: { value: "assigned" } });
    const build = screen.getByRole("group", { name: "Build" });
    fireEvent.click(within(build).getByText("People", { exact: true }));
    expect(within(build).getByRole("checkbox", { name: "Lead" })).toBeTruthy();
    expect(within(build).queryByRole("checkbox", { name: "Member" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Room owner" }), { target: { value: "Lead" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Owner's furnishing" }), { target: { value: "direct" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "Lead", ownerBuildApproval: "direct" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Access" }), { target: { value: "none" } });
    expect(screen.getByText("Give the owner room access to skip approval.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Propose changes" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
