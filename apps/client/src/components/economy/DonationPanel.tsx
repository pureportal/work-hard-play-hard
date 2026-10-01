import type { ClientCommand, PublicEconomy } from "@workhard/shared";
import { WORKSPACE_FUND_ID } from "@workhard/shared";
import { WorkspaceDialog } from "../WorkspaceDialog";
import { DonateCoins } from "./DonateCoins";
import "../../public-economy.css";

export function DonationPanel({ economy, balance, pending, disabled = false, error, onCommand, onClose }: {
  economy: PublicEconomy; balance: number;
  pending: boolean; disabled?: boolean; error?: string | undefined;
  onCommand: (command: Extract<ClientCommand, { type: "economy.donate" }>) => void;
  onClose: () => void;
}) {
  const sharedBalance = economy.funds.find((fund) => fund.id === WORKSPACE_FUND_ID)!.balance;
  return <WorkspaceDialog title="Transfer to Shared" className="shared-transfer-dialog" onClose={onClose}>
    <DonateCoins balance={balance} sharedBalance={sharedBalance} pending={pending} disabled={disabled} error={error}
      onDonate={(amount) => onCommand({ type: "economy.donate", requestId: crypto.randomUUID(), fundId: WORKSPACE_FUND_ID, amount })} />
  </WorkspaceDialog>;
}
