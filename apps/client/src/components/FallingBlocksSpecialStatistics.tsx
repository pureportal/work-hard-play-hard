import { useState } from "react";
import {
  FALLING_BLOCKS_DEFINITION_ID,
  FALLING_BLOCKS_SPECIAL_LABELS,
  fallingBlocksAverages,
  type FallingBlocksSpecialCounts,
  type Member,
  type PlayerGameStatistics,
} from "@workhard/shared";

interface FallingBlocksSpecialStatisticsProps {
  members: Member[];
  statistics: PlayerGameStatistics[];
  currentUserId: string;
}

export function FallingBlocksSpecialStatistics({ members, statistics, currentUserId }: FallingBlocksSpecialStatisticsProps) {
  const [selectedUserId, setSelectedUserId] = useState(currentUserId);
  const measured = statistics.find((entry) => entry.definitionId === FALLING_BLOCKS_DEFINITION_ID && entry.userId === selectedUserId)?.fallingBlocks;
  const averages = measured ? fallingBlocksAverages(measured) : undefined;
  return (
    <details className="falling-blocks-special-statistics">
      <summary>Specials</summary>
      <select aria-label="Player statistics" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
        {members.map((member) => <option key={member.id} value={member.id}>{member.id === currentUserId ? "You" : member.name}</option>)}
      </select>
      {measured && averages ? <table>
        <caption>{measured.gamesPlayed} {measured.gamesPlayed === 1 ? "game" : "games"} tracked</caption>
        <thead><tr><th scope="col">Move</th><th scope="col">Total</th><th scope="col">Per game</th></tr></thead>
        <tbody>{(Object.keys(FALLING_BLOCKS_SPECIAL_LABELS) as Array<keyof FallingBlocksSpecialCounts>).map((key) =>
          <tr key={key}><th scope="row">{FALLING_BLOCKS_SPECIAL_LABELS[key]}</th><td>{measured.totals[key].toLocaleString()}</td><td>{averages[key].toFixed(2)}</td></tr>,
        )}</tbody>
      </table> : <p>No games tracked yet.</p>}
    </details>
  );
}
