// Who is allowed into the AGENCY (internal) app, and at what role.
//
// Rule (Pedro): anyone with a @runna.com.mx Google account gets in as a specialist
// (`creative` → "Especialista"); PLUS an explicit master exception for Pedro's
// personal account. Clients never come through here — they get in via an approved
// magic link (see the portal flow), never via this domain rule.
//
// The domain list is env-driven (AUTH_ALLOWED_DOMAINS, comma-separated). The master
// exception is kept in CODE, clearly commented, per the go-live spec — with an env
// override (AUTH_MASTER_EMAILS) so it can be extended without a deploy.

const DOMAINS = (process.env.AUTH_ALLOWED_DOMAINS ?? "runna.com.mx")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// ⭐ Master builder — the platform owner (Pedro). `unique@runna.com.mx` is itself a
//    runna.com.mx address, so the domain rule already lets it IN; listing it here
//    UPGRADES it from the default 'creative' to 'master'. Extend/override via env
//    (AUTH_MASTER_EMAILS, comma-separated) — e.g. to add a personal account too.
const MASTER_EMAILS = (process.env.AUTH_MASTER_EMAILS ?? "unique@runna.com.mx")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type AgencyRole = "master" | "creative";

/**
 * The role an email should get as an AGENCY user, or null if it isn't allowed in
 * through the agency door at all. Pure — no I/O — so it's unit-testable.
 */
export function agencyRoleForEmail(email: string | null | undefined): AgencyRole | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  if (MASTER_EMAILS.includes(e)) return "master";
  const domain = e.split("@")[1] ?? "";
  if (DOMAINS.includes(domain)) return "creative";
  return null;
}

/** True if the email may enter the internal app (any agency role). */
export function isAgencyEmail(email: string | null | undefined): boolean {
  return agencyRoleForEmail(email) !== null;
}
