// Real MetaMask / injected wallet connect via EIP-1193 window.ethereum.
// No WalletConnect (not configured). Works with MetaMask, Rabby, Brave Wallet, Coinbase.

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectInjectedWallet(): Promise<string> {
  if (!hasInjectedWallet()) {
    throw new Error(
      "No wallet detected. Install MetaMask, Rabby, or Coinbase Wallet.",
    );
  }
  const accounts = (await window.ethereum!.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned by wallet");
  return accounts[0].toLowerCase();
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
