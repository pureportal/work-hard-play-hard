import { ArrowRight, Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmationDialog } from "../ConfirmationDialog";

export function DonateCoins({ balance, sharedBalance, pending, disabled = false, error, onDonate }: {
  balance: number; sharedBalance: number; pending: boolean; disabled?: boolean; error?: string | undefined; onDonate: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => { setAmount(""); setReviewing(false); }, [balance]);
  useEffect(() => { if (disabled) setReviewing(false); }, [disabled]);
  const coins = Number(amount);
  const valid = Number.isSafeInteger(coins) && coins > 0 && coins <= balance;
  return <form className="shared-transfer-form" onSubmit={(event) => {
    event.preventDefault();
    if (valid && !pending && !disabled) setReviewing(true);
  }}>
    <div className="shared-transfer-route">
      <div className="shared-transfer-wallet"><Coins size={22} aria-hidden="true" /><span>Personal</span><strong>{balance.toLocaleString()}</strong></div>
      <span className="shared-transfer-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
      <div className="shared-transfer-pot"><Coins size={22} aria-hidden="true" /><span>Shared</span><strong>{sharedBalance.toLocaleString()}</strong></div>
    </div>
    <fieldset disabled={pending || disabled}>
      <label>Amount<input type="number" name="amount" min={1} max={balance} step={1} required value={amount} readOnly={reviewing}
        onChange={(event) => setAmount(event.target.value)} /></label>
      <div className="shared-transfer-presets">{[25, 50, 100].filter((value) => value < balance).map((value) =>
        <button key={value} type="button" className="secondary-button" aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>{value}</button>)}
        <button type="button" className="secondary-button" aria-pressed={balance > 0 && amount === String(balance)} disabled={balance === 0} onClick={() => setAmount(String(balance))}>Max</button></div>
      {reviewing && valid && <ConfirmationDialog
        title={`Transfer ${coins.toLocaleString()} coins to Shared?`}
        description="Shared money cannot be returned to your personal wallet."
        confirmLabel="Transfer coins" cancelLabel="Edit amount" pending={pending} error={error}
        onCancel={() => setReviewing(false)} onConfirm={() => { if (valid && !pending && !disabled) onDonate(coins); }} />}
      <button type="submit" className="primary-button" disabled={!valid || pending || disabled}>{disabled ? "Reconnect to transfer" : pending ? "Transferring…" : "Review transfer"}</button>
    </fieldset>
  </form>;
}
