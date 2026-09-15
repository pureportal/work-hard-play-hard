import type { BootstrapData, ChatMessage, WhiteboardStatus } from "@workhard/shared";

export function populateWorkplaceActivity(data: BootstrapData, now: Date): void {
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
  data.conversations = [
    { id: "conversation-team", name: "Alder Works", type: "team", unread: 0 },
    ...data.layouts.flatMap((layout) => layout.rooms.filter((room) => !room.id.includes("gallery")).map((room) => ({
      id: `conversation-${room.id}`, name: room.name, type: "room" as const, roomId: room.id, unread: 0,
    }))),
    { id: "conversation-design-handoff", name: "Yuki & Dev", type: "direct", participantIds: ["person-yuki", "person-dev"], unread: 0 },
  ];
  const threads: [conversationId: string, messages: [username: string, body: string][]][] = [
    ["conversation-team", [
      ["elise", "The courtyard is ready for lunch. Omar planted rosemary and thyme beside the terrace."],
      ["omar", "The herbs are for everyone. Please leave the smaller plants another week to settle in."],
      ["lucia", "Our next release review is in Juniper tomorrow. Bring one customer problem you want us to solve next."],
      ["nina", "I have three examples from this week's support conversations. I'll add them to the research board."],
      ["rowan", "Thanks, Nina. Let's leave the review with a short list and a clear owner for each item."],
      ["soren", "A new chess challenge is up in the games room for the lunch break."],
    ]],
    ["conversation-room-engineering", [
      ["soren", "The deployment checklist is on the workshop board. Rollback rehearsal is complete."],
      ["mei", "Metrics look steady after the rehearsal. I added the dashboard links to our internal notes."],
      ["dev", "The keyboard navigation changes are ready for design review."],
      ["imani", "Pair with Yuki this afternoon, then we can schedule the accessibility pass."],
    ]],
    ["conversation-room-design", [
      ["yuki", "I've grouped the customer findings into three themes on the discovery board."],
      ["celia", "The strongest theme is that people lose their place when they switch tasks."],
      ["ines", "I'll prototype a simpler handoff and bring two variations to the review."],
    ]],
    ["conversation-room-cafe", [
      ["omar", "Coffee beans are restocked. The tea cart upstairs has fresh mint."],
      ["tess", "The terrace table is a lovely spot for our Friday lunch."],
    ]],
    ["conversation-design-handoff", [
      ["dev", "Could we walk through the focus order together after lunch?"],
      ["yuki", "Yes, meet me at the atelier board at two."],
      ["dev", "Great. I'll bring the updated prototype."],
    ]],
  ];
  let time = -240;
  data.messages = threads.flatMap(([conversationId, messages]) => messages.map<ChatMessage>(([username, body], index) => ({
    id: `${conversationId}-${index + 1}`, conversationId, userId: `person-${username}`, body,
    sequence: index + 1, createdAt: at(time += 4),
  })));
  data.meetings = [
    { id: "meeting-release-review", title: "Release review", startsAt: at(24 * 60), durationMinutes: 45, status: "scheduled",
      participantIds: [], location: { type: "room", roomId: "room-juniper" } },
    { id: "meeting-research-review", title: "Customer findings", startsAt: at(26 * 60), durationMinutes: 30, status: "scheduled",
      participantIds: [], location: { type: "room", roomId: "room-design" } },
    { id: "meeting-delivery-retro", title: "Delivery retrospective", startsAt: at(-24 * 60), durationMinutes: 45, status: "ended",
      participantIds: [], location: { type: "room", roomId: "room-juniper" } },
  ];
  const objects = data.layouts.flatMap((layout) => layout.objects);
  for (const [suffix, title, cards] of [
    ["engineering-board", "Delivery", ["Keyboard navigation", "Deployment rehearsal", "Performance budget"]],
    ["design-board", "Discovery", ["Keep context between tasks", "Make handoffs clearer", "Test two prototypes"]],
    ["juniper-board", "Release review", ["Customer outcomes", "Readiness check", "Owners and next steps"]],
  ] as const) {
    const object = objects.find(({ id }) => id === `floor-workplace-${suffix}`)!;
    object.label = title;
    object.workState = { kind: "whiteboard", revision: 3, document: {
      text: title === "Discovery" ? "Research synthesis\nSix interviews completed. Next: test the handoff flow with support and two customers." : "Agree the next step and an owner before closing the review.",
      cards: cards.map((text, index) => ({ id: `${suffix}-${index}`, kind: "note", title: text, text: "",
        color: (["mint", "blue", "yellow"] as const)[index]!, status: (["doing", "done", "todo"] satisfies WhiteboardStatus[])[index]!,
        dueDate: "", x: 80 + index * 440, y: 100, width: 360, height: 220 })),
    } };
  }
  for (const [id, title, items] of [
    ["floor-workplace-cafe-checklist", "Kitchen", ["Restock coffee beans", "Water the terrace herbs", "Order oat milk"]],
    ["floor-retreat-workshop-board", "Release checklist", ["Rehearse rollback", "Review keyboard navigation", "Run the accessibility pass", "Confirm the release owner"]],
  ] as const) {
    const object = objects.find((object) => object.id === id)!;
    object.label = title;
    object.workState = { kind: "checklist", revision: 2,
      items: items.map((text, index) => ({ id: `${id}-${index}`, text, completed: index === 0 })) };
  }
}
