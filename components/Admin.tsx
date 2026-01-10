import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  listHouseholdInvites,
  listHouseholdMembers,
  revokeHouseholdInvite,
  upsertHouseholdInvite,
  updateHouseholdMember,
  type HouseholdInvite,
  type HouseholdMember,
  type MemberRole,
} from "../lib/cloudStore";

type Props = {
  householdId: string;
  user: User | null;
  memberRole: MemberRole | null;
};

const ROLE_OPTIONS: MemberRole[] = ["ADMIN", "EDITOR", "LEITOR"];

function fmtTs(ts: any): string {
  try {
    const d: Date | null = ts?.toDate ? ts.toDate() : null;
    if (!d) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

const Admin: React.FC<Props> = ({ householdId, user, memberRole }) => {
  const isAdmin = memberRole === "ADMIN";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("LEITOR");

  const reload = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const [inv, mem] = await Promise.all([
        listHouseholdInvites(householdId),
        listHouseholdMembers(householdId),
      ]);
      setInvites(inv);
      setMembers(mem);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [householdId, isAdmin]);

  useEffect(() => {
    reload();
  }, [reload]);

  const membersByUid = useMemo(() => {
    const m = new Map<string, HouseholdMember>();
    members.forEach((x) => m.set(x.uid, x));
    return m;
  }, [members]);

  const canEditMember = useCallback(
    (uid: string) => {
      // Admin pode editar qualquer um, mas evita desativar a si mesmo por engano na UI
      if (!user?.uid) return true;
      return uid !== user.uid;
    },
    [user?.uid]
  );

  const handleCreateInvite = useCallback(async () => {
    if (!isAdmin) return;
    const email = String(inviteEmail || "").trim();
    if (!email) {
      setError("Informe um e-mail.");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await upsertHouseholdInvite({
        email,
        role: inviteRole,
        householdId,
        createdByUid: user?.uid ?? null,
      });
      setInviteEmail("");
      setInviteRole("LEITOR");
      setInfo("Convite criado/atualizado.");
      await reload();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Falha ao criar convite.");
    } finally {
      setLoading(false);
    }
  }, [householdId, inviteEmail, inviteRole, isAdmin, reload, user?.uid]);

  const handleRevokeInvite = useCallback(
    async (email: string) => {
      if (!isAdmin) return;
      if (!confirm("Revogar este convite pendente?")) return;
      setLoading(true);
      setError("");
      setInfo("");
      try {
        await revokeHouseholdInvite({
          email,
          householdId,
          revokedByUid: user?.uid ?? null,
        });
        setInfo("Convite revogado.");
        await reload();
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Falha ao revogar convite.");
      } finally {
        setLoading(false);
      }
    },
    [householdId, isAdmin, reload, user?.uid]
  );

  const handleUpdateMember = useCallback(
    async (uid: string, patch: { role?: MemberRole; active?: boolean }) => {
      if (!isAdmin) return;
      setLoading(true);
      setError("");
      setInfo("");
      try {
        await updateHouseholdMember({
          uid,
          householdId,
          role: patch.role,
          active: patch.active,
          updatedByUid: user?.uid ?? null,
        });
        setInfo("Membro atualizado.");
        await reload();
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : "Falha ao atualizar membro.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [householdId, isAdmin, reload, user?.uid]
  );

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
          <h2 className="text-bb-blue font-black uppercase tracking-tighter">Administração</h2>
          <p className="text-xs text-gray-500 mt-2">Acesso restrito a administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-bb-blue font-black uppercase tracking-tighter">Administração</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
              Convites e permissões do household
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="px-4 py-2 rounded-2xl bg-gray-100 text-[10px] font-black uppercase tracking-widest"
            disabled={loading}
          >
            Recarregar
          </button>
        </div>

        {(error || info) && (
          <div className="space-y-2">
            {error && <div className="text-xs font-bold text-red-600">{error}</div>}
            {info && <div className="text-xs font-bold text-emerald-600">{info}</div>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Convites */}
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-bb-blue font-black uppercase tracking-tighter text-sm">Convites</h3>
            <span className="text-[10px] font-black uppercase text-gray-400">{invites.length}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-[9px] font-black uppercase text-gray-400 italic">E-mail</label>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-gray-50 p-3 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue"
                placeholder="email@dominio.com"
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-gray-400 italic">Perfil</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                className="w-full bg-gray-50 p-3 rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-bb-blue"
                disabled={loading}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreateInvite}
              className="bg-bb-blue text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
              disabled={loading}
            >
              Criar convite
            </button>
          </div>

          <div className="border-t pt-4 space-y-2">
            {invites.length === 0 ? (
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Nenhum convite
              </div>
            ) : (
              invites.map((inv) => (
                <div
                  key={inv.emailLower}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/60 border border-gray-100 rounded-2xl p-4"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-black text-gray-700 truncate">{inv.email}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                      {inv.role} • {inv.status}
                      {inv.createdAt ? ` • ${fmtTs(inv.createdAt)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(inv.emailLower)}
                        className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        disabled={loading}
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Membros */}
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-bb-blue font-black uppercase tracking-tighter text-sm">Membros</h3>
            <span className="text-[10px] font-black uppercase text-gray-400">{members.length}</span>
          </div>

          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Nenhum membro
              </div>
            ) : (
              members.map((m) => (
                <div
                  key={m.uid}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50/60 border border-gray-100 rounded-2xl p-4"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-black text-gray-700 truncate">
                      {m.name ? `${m.name} • ` : ""}
                      {m.email || m.uid}
                    </div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                      UID: {m.uid}
                      {m.updatedAt ? ` • ${fmtTs(m.updatedAt)}` : ""}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleUpdateMember(m.uid, {
                          role: e.target.value as MemberRole,
                          active: m.active,
                        })
                      }
                      className="bg-white p-2 rounded-xl text-xs font-black border border-gray-200"
                      disabled={loading}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateMember(m.uid, {
                          role: m.role,
                          active: !m.active,
                        })
                      }
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border disabled:opacity-50 ${
                        m.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                      disabled={loading || !canEditMember(m.uid)}
                      title={!canEditMember(m.uid) ? "Edite seu próprio usuário via outro admin." : ""}
                    >
                      {m.active ? "Ativo" : "Inativo"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* apoio visual: mostra se há convites aceitos sem membership (diagnóstico rápido) */}
          {invites.some((i) => i.status === "accepted") && (
            <div className="pt-2">
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Convites aceitos: {invites.filter((i) => i.status === "accepted").length}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                Se um usuário aceitou convite mas não aparece como membro, confira as rules e o log do console.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
