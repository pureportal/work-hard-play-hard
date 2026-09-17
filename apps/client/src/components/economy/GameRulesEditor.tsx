import { useEffect, useState } from "react";
import type { GlobalKidnappingSettings, Member } from "@workhard/shared";
import { PolicyEditor } from "../PolicyEditor";

export function GameRulesEditor({ settings, members, pending, onPropose, onOpenRooms }: {
  settings: GlobalKidnappingSettings; members: Member[]; pending: boolean;
  onPropose: (settings: GlobalKidnappingSettings) => void; onOpenRooms: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return <div className="game-rules-editor"><button className="secondary-button" onClick={onOpenRooms}>Room settings</button>
    <form className="admin-settings-form" onSubmit={(event) => { event.preventDefault(); onPropose(draft); }}>
      <h3>Carrying</h3><fieldset disabled={pending}><label className="permission-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />Enable carrying</label>
        {draft.enabled && <PolicyEditor label="Who can be carried" policy={draft.targetPolicy} members={members} onChange={(targetPolicy) => setDraft({ ...draft, targetPolicy })} />}
        <button className="primary-button" disabled={JSON.stringify(draft) === JSON.stringify(settings)}>Propose rules</button>
      </fieldset>
    </form>
  </div>;
}
