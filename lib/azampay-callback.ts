// Read an AzamPay callback body into one normalised shape. Pure, no imports.
//
// AzamPay's official callback schema could not be retrieved while building this, so the parser is deliberately
// tolerant about field NAMES (case-insensitive, a few known aliases, one level of "data" nesting) but strict about
// MEANING: anything it cannot confidently read as "success" or "failed" is "unknown" and changes nothing.
// The raw body is always stored (payment_callbacks) so the real shape can be checked and the aliases tightened.

export type CallbackStatus = "success" | "failed" | "unknown";

export type ParsedCallback = {
  /** our reference that we sent as externalId */
  externalId: string;
  status: CallbackStatus;
  amount: string | number | null;
  providerRef: string | null;
  message: string | null;
  /** present only if AzamPay sends one (checked against AZAMPAY_CALLBACK_PASSWORD when that is configured) */
  password: string | null;
};

const first = (m: Map<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = m.get(k);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

/** "success"/"completed"/"paid" → success; "fail…/declin…/cancel…/reject…/timeout/expire…" → failed; else unknown. */
export function normalizeStatus(v: unknown): CallbackStatus {
  if (v === true) return "success";
  if (v === false) return "failed";
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s) return "unknown";
  if (/^(success|successful|succeeded|completed|complete|paid|approved|ok)$/.test(s)) return "success";
  if (/(fail|unsuccess|declin|cancel|reject|timeout|timed out|expire|insufficient|error)/.test(s)) return "failed";
  return "unknown";
}

export function parseCallback(body: unknown): ParsedCallback | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const flat = new Map<string, unknown>();
  const add = (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) {
      const key = k.toLowerCase();
      if (!flat.has(key)) flat.set(key, v);
    }
  };
  const root = body as Record<string, unknown>;
  add(root);
  for (const nest of ["data", "payload", "transaction"]) {
    const inner = root[nest];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) add(inner as Record<string, unknown>);
  }

  const externalId = str(first(flat, ["utilityref", "externalid", "external_id", "externalreference", "merchantreference", "merchantref"]));
  if (!externalId) return null;

  return {
    externalId,
    status: normalizeStatus(first(flat, ["transactionstatus", "transaction_status", "status", "paymentstatus", "payment_status", "success"])),
    amount: (first(flat, ["amount", "transactionamount"]) as string | number | undefined) ?? null,
    providerRef: str(first(flat, ["reference", "transactionid", "transaction_id", "fspreferenceid", "pgreferenceid", "mnoreference"])),
    message: str(first(flat, ["message", "description", "reason"])),
    password: str(first(flat, ["password", "callbackpassword"])),
  };
}
