import { Coins } from "lucide-react";

export function SharedMoneyButton({ balance, onClick, className = "" }: {
  balance: number;
  onClick: () => void;
  className?: string;
}) {
  return <button type="button" className={`shared-money-button ${className}`} aria-label={`Transfer money to Shared. Shared balance ${balance.toLocaleString()} coins`} onClick={onClick}>
    <Coins size={16} aria-hidden="true" /><span>Shared</span><strong>{balance.toLocaleString()}</strong>
  </button>;
}
