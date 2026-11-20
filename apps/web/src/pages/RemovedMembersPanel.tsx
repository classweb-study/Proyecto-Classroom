import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Member = { id: string; login: string; role: 'TEACHER' | 'STUDENT'; pending: boolean };

export function RemovedMembersPanel({ institutionId, institutionName, onOpenRequests, onRestored }: {
  institutionId: string;
  institutionName: string;
  onOpenRequests: () => void;
  onRestored: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/admin/institutions/${institutionId}`;

  useEffect(() => {
    let current = true;
    setError('');
    api<{ members: Member[] }>(url + '/removed-members').then(result => {
      if (current) setMembers(result.members);
    }).catch(() => {
      if (current) setError('No pudimos cargar las personas removidas.');
    });
    return () => { current = false; };
  }, [url, revision]);

  async function restore(member: Member) {
    setBusy(true);
    setNotice('');
    try {
      await api(url + '/members/' + member.id + '/restore', { method: 'POST' });
      setMembers(previous => previous?.filter(item => item.id !== member.id) ?? []);
      setNotice(`@${member.login} recuperó su acceso a ${institutionName}.`);
      onRestored();
    } catch {
      setNotice('No se pudo restaurar el acceso. Revisa el estado actualizado.');
    } finally {
      setSelected(null);
      setBusy(false);
      setRevision(value => value + 1);
    }
  }

  return <section className="admin-panel">
    <h2>Personas baneadas o removidas</h2>
    <p>Restaura el acceso a {institutionName} con el último rol de la persona.</p>
    {notice && <p role="status">{notice}</p>}
    {error ? <p role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>Reintentar</button></p>
      : !members ? <p>Cargando…</p>
      : members.length === 0 ? <p>No hay personas pendientes de desbaneo.</p>
      : <ul className="plain-list">{members.map(member => {
        const role = member.role === 'TEACHER' ? 'profesor' : 'estudiante';
        return <li key={member.id}>
          <span>@{member.login} · {role}</span>
          {member.pending ? <button className="link-button" onClick={onOpenRequests}>Revisar solicitud pendiente</button>
            : selected === member.id ? <div className="form-actions">
              <span>¿Devolver el acceso como {role}?</span>
              <button disabled={busy} onClick={() => setSelected(null)}>Cancelar</button>
              <button className="approve-button" disabled={busy} onClick={() => void restore(member)}>Confirmar desbaneo</button>
            </div>
            : <button className="approve-button" disabled={busy} onClick={() => setSelected(member.id)}>Desbanear</button>}
        </li>;
      })}</ul>}
  </section>;
}
