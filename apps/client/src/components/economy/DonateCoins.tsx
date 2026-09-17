import { ArrowRight, Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmationDialog } from "../ConfirmationDialog";

export function DonateCoins({ balance, fundName, pending, error, onDonate }: {
  balance: number; fundName: string; pending: boolean; error?: string | undefined; onDonate: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [donated, setDonated] = useState(false);
  useEffect(() => { setAmount(""); setReviewing(false); }, [balance]);
  const coins = Number(amount);
  const valid = Number.isSafeInteger(coins) && coins > 0 && coins <= balance;
  return <form className="donation-form" onSubmit={(event) => {
    event.preventDefault();
    if (!valid || pending) return;
    setReviewing(true);
  }}>
    <div className="donation-route"><div><Coins size={24} /><strong>Your wallet</strong><span>{balance.toLocaleString()} coins</span></div>
      <ArrowRight size={22} aria-hidden="true" /><div><Coins size={24} /><strong>{fundName}</strong><span>Shared fund</span></div></div>
    <fieldset disabled={pending}>
      <label>Donation<input type="number" name="amount" min={1} max={balance} step={1} required value={amount} readOnly={reviewing}
        onChange={(event) => { setAmount(event.target.value); setDonated(false); }} /></label>
      <div className="donation-presets">{[25, 50, 100].filter((value) => value < balance).map((value) =>
        <button key={value} type="button" className="secondary-button" onClick={() => { setAmount(String(value)); setDonated(false); }}>{value}</button>)}
        <button type="button" className="secondary-button" disabled={balance === 0} onClick={() => { setAmount(String(balance)); setDonated(false); }}>Max</button></div>
      {reviewing && valid && <ConfirmationDialog
        title={`Donate ${coins.toLocaleString()} coins to ${fundName}?`}
        description="These coins become shared money and cannot be taken back."
        confirmLabel="Donate coins" cancelLabel="Edit amount" pending={pending} error={error}
        onCancel={() => setReviewing(false)} onConfirm={() => { if (valid && !pending) { setDonated(true); onDonate(coins); } }} />}
      <div className="economy-actions"><button type="submit" className="primary-button" disabled={!valid}>{pending ? "Donating…" : "Review donation"}</button></div>
      {balance === 0 && <p role="status">Your wallet is empty.</p>}
      {donated && !amount && <p role="status">Donation sent.</p>}
    </fieldset>
  </form>;
}
