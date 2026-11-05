import "server-only";

import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  http,
  keccak256,
  parseEther,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

import artifact from "@/lib/chain/escrowArtifact.json";

/**
 * Tveris on BNB Smart Chain testnet, built the same way as the Amanah agent.
 *
 * The AGENT key is the escrow's arbiter: it deploys the escrow, records the
 * shipment and signs every release or refund with the hash of its verdict.
 * The demo IMPORTER (buyer) and EXPORTER (seller) are throwaway keys so one
 * person can play both sides; real users would sign from their own wallets.
 *
 * The escrow is always the agent's FIRST transaction, so its address is
 * derived from the agent key alone and no deployment file is needed (this
 * keeps the serverless deploy stateless).
 */

export const ESCROW_ABI = artifact.abi as Abi;
export const EXPLORER = "https://testnet.bscscan.com";
export const FEE_BPS = 50; // 0.5% to the agent, only when a shipment is verified
export const DEAL_VALUE = parseEther("0.001"); // test BNB moved per deal

const transport = http(process.env.BSC_TESTNET_RPC ?? "https://bsc-testnet-rpc.publicnode.com", { retryCount: 3, timeout: 20_000 });
export const publicClient = createPublicClient({ chain: bscTestnet, transport });

function key(name: "TVERIS_AGENT_KEY" | "TVERIS_BUYER_KEY" | "TVERIS_SELLER_KEY"): Hex {
  const value = process.env[name];
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new ChainNotConfigured(`${name} is not set.`);
  return value as Hex;
}

export class ChainNotConfigured extends Error {}

export function accounts() {
  const agent = privateKeyToAccount(key("TVERIS_AGENT_KEY"));
  const buyer = privateKeyToAccount(key("TVERIS_BUYER_KEY"));
  const seller = privateKeyToAccount(key("TVERIS_SELLER_KEY"));
  return { agent, buyer, seller };
}

export function escrowAddress(): Address {
  if (process.env.TVERIS_ESCROW) return process.env.TVERIS_ESCROW as Address;
  return getContractAddress({ from: accounts().agent.address, nonce: 0n });
}

async function send(who: "agent" | "buyer", tx: { to?: Address; data: Hex; value?: bigint }): Promise<TransactionReceipt> {
  const account = who === "agent" ? accounts().agent : accounts().buyer;
  const wallet = createWalletClient({ account, chain: bscTestnet, transport });
  const hash = await wallet.sendTransaction({ to: tx.to ?? null, data: tx.data, value: tx.value ?? 0n } as Parameters<typeof wallet.sendTransaction>[0]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 55_000 });
  if (receipt.status !== "success") throw new Error(`The transaction reverted: ${hash}`);
  return receipt;
}

const call = (functionName: string, args: unknown[]) => encodeFunctionData({ abi: ESCROW_ABI, functionName, args });

/** Hash of any JSON-able record, as written on-chain. */
export const hashOf = (value: unknown): Hex => keccak256(toHex(JSON.stringify(value)));

export async function status() {
  const { agent, buyer, seller } = accounts();
  const escrow = escrowAddress();
  const [agentBal, buyerBal, sellerBal, code] = await Promise.all([
    publicClient.getBalance({ address: agent.address }),
    publicClient.getBalance({ address: buyer.address }),
    publicClient.getBalance({ address: seller.address }),
    publicClient.getCode({ address: escrow }),
  ]);
  return {
    chainId: bscTestnet.id,
    explorer: EXPLORER,
    escrow,
    deployed: Boolean(code && code !== "0x"),
    dealValue: "0.001",
    agent: { address: agent.address, balance: agentBal.toString() },
    buyer: { address: buyer.address, balance: buyerBal.toString() },
    seller: { address: seller.address, balance: sellerBal.toString() },
  };
}

/** One-time setup: deploy the escrow (agent's first tx), then fund the demo importer. */
export async function setup(): Promise<{ steps: Array<{ label: string; hash: Hex }> }> {
  const { agent, buyer } = accounts();
  const steps: Array<{ label: string; hash: Hex }> = [];
  const code = await publicClient.getCode({ address: escrowAddress() });
  if (!code || code === "0x") {
    const nonce = await publicClient.getTransactionCount({ address: agent.address });
    if (nonce !== 0) throw new Error("The agent wallet has already been used, so set TVERIS_ESCROW to the deployed escrow address.");
    const receipt = await send("agent", { data: encodeDeployData({ abi: ESCROW_ABI, bytecode: artifact.bytecode as Hex, args: [agent.address, FEE_BPS] }) });
    steps.push({ label: "Escrow contract deployed", hash: receipt.transactionHash });
  }
  const buyerBal = await publicClient.getBalance({ address: buyer.address });
  if (buyerBal < parseEther("0.004")) {
    const receipt = await send("agent", { to: buyer.address, data: "0x", value: parseEther("0.01") });
    steps.push({ label: "Importer wallet funded", hash: receipt.transactionHash });
  }
  return { steps };
}

/** The importer pays into escrow. Returns the on-chain deal id. */
export async function fund(listing: unknown, shipBySeconds: number): Promise<{ hash: Hex; dealId: number; listingHash: Hex }> {
  const { seller } = accounts();
  const listingHash = hashOf(listing);
  const shipBy = BigInt(Math.floor(Date.now() / 1000) + shipBySeconds);
  const receipt = await send("buyer", { to: escrowAddress(), data: call("createDeal", [seller.address, shipBy, listingHash]), value: DEAL_VALUE });
  const dealId = Number(await publicClient.readContract({ address: escrowAddress(), abi: ESCROW_ABI, functionName: "dealCount" }));
  return { hash: receipt.transactionHash, dealId, listingHash };
}

/** The agent records the shipping proof (container, seal, vessel, BL hash) on behalf of the exporter. */
export async function markShipped(dealId: number, shipment: unknown): Promise<{ hash: Hex; shippingHash: Hex }> {
  const shippingHash = hashOf(shipment);
  const receipt = await send("agent", { to: escrowAddress(), data: call("markShipped", [BigInt(dealId), shippingHash]) });
  return { hash: receipt.transactionHash, shippingHash };
}

/** The agent settles the deal with the hash of its full verdict. */
export async function settle(dealId: number, decision: "RELEASE" | "REFUND", verdict: unknown): Promise<{ hash: Hex; verdictHash: Hex }> {
  const verdictHash = hashOf(verdict);
  const receipt = await send("agent", { to: escrowAddress(), data: call(decision === "RELEASE" ? "release" : "refund", [BigInt(dealId), verdictHash]) });
  return { hash: receipt.transactionHash, verdictHash };
}
