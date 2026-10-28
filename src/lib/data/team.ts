import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INVITE_DAYS, normalizeEmail, type MemberRole } from "@/lib/analytics/team";
import { one, pool, query } from "@/lib/db";

// Equipe do dono. Quem convida e remove é sempre o dono (ownerId vem da sessão dele).

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Espaços em que a pessoa é membro (além do próprio). */
export function membershipsOf(userId: string) {
  return query<{ owner_id: string; role: MemberRole; owner_email: string }>(
    `select m.owner_id, m.role, u.email as owner_email from team_members m join "user" u on u.id = m.owner_id
     where m.user_id = $1 order by m.created_at`,
    [userId],
  );
}

export function teamOf(ownerId: string) {
  return query<{ user_id: string; email: string; role: MemberRole; created_at: string }>(
    `select m.user_id, u.email, m.role, m.created_at from team_members m join "user" u on u.id = m.user_id
     where m.owner_id = $1 order by m.created_at`,
    [ownerId],
  );
}

export function pendingInvites(ownerId: string) {
  return query<{ token_hash: string; email: string; role: MemberRole; expires_at: string }>(
    `select token_hash, email, role, expires_at from team_invites
     where owner_id = $1 and accepted_at is null and expires_at > now() order by created_at desc`,
    [ownerId],
  );
}

/** Cria o convite e devolve o código (só existe aqui: no banco fica o hash). */
export async function createInvite(ownerId: string, email: string, role: MemberRole) {
  const token = randomBytes(24).toString("base64url");
  await query(
    `insert into team_invites (token_hash, owner_id, email, role, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [hash(token), ownerId, normalizeEmail(email), role, INVITE_DAYS],
  );
  return token;
}

export async function revokeInvite(ownerId: string, tokenHash: string) {
  await query("delete from team_invites where owner_id = $1 and token_hash = $2 and accepted_at is null", [ownerId, tokenHash]);
}

export function inviteByToken(token: string) {
  return one<{ owner_id: string; owner_email: string; email: string; role: MemberRole; expires_at: string; accepted_at: string | null }>(
    `select i.owner_id, u.email as owner_email, i.email, i.role, i.expires_at, i.accepted_at
     from team_invites i join "user" u on u.id = i.owner_id where i.token_hash = $1`,
    [hash(token)],
  );
}

export type AcceptResult = "ok" | "invalido" | "expirado" | "usado" | "outro-email" | "proprio";

/** Aceita o convite: só a pessoa do e-mail convidado, uma vez e dentro do prazo. */
export async function acceptInvite(token: string, user: { id: string; email: string }): Promise<{ result: AcceptResult; ownerId?: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const inv = (
      await client.query<{ owner_id: string; email: string; role: MemberRole; expired: boolean; accepted_at: string | null }>(
        "select owner_id, email, role, expires_at <= now() as expired, accepted_at from team_invites where token_hash = $1 for update",
        [hash(token)],
      )
    ).rows[0];
    const fail = async (result: AcceptResult) => {
      await client.query("rollback");
      return { result };
    };
    if (!inv) return fail("invalido");
    if (inv.accepted_at) return fail("usado");
    if (inv.expired) return fail("expirado");
    if (normalizeEmail(user.email) !== inv.email) return fail("outro-email");
    if (inv.owner_id === user.id) return fail("proprio");
    await client.query(
      `insert into team_members (owner_id, user_id, role) values ($1, $2, $3)
       on conflict (owner_id, user_id) do update set role = excluded.role`,
      [inv.owner_id, user.id, inv.role],
    );
    await client.query("update team_invites set accepted_by = $2, accepted_at = now() where token_hash = $1", [hash(token), user.id]);
    await client.query("commit");
    return { result: "ok", ownerId: inv.owner_id };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function setMemberRole(ownerId: string, userId: string, role: MemberRole) {
  await query("update team_members set role = $3 where owner_id = $1 and user_id = $2", [ownerId, userId, role]);
}

export async function removeMember(ownerId: string, userId: string) {
  await query("delete from team_members where owner_id = $1 and user_id = $2", [ownerId, userId]);
}
