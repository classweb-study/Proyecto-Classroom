import { useCallback, useEffect, useState } from 'react';

type MemberRole = 'TEACHER' | 'STUDENT';

type InstitutionMember = {
  membershipId: string;
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
  role: MemberRole;
  membershipStatus: 'ACTIVE';
  joinedAt: string;
  institutionalIdentifier: string | null;
  academicIdentityStatus:
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | null;
};

type AdminMembersPageProps = {
  institutionId: string;
  institutionName: string;
  role: MemberRole;
  currentUserId: string;
};

type PendingAction = {
  membershipId: string;
  kind: 'revoke' | 'role';
};

type LoadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      members: InstitutionMember[];
    }
  | {
      status: 'error';
      message: string;
    };

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function identityLabel(
  status: InstitutionMember['academicIdentityStatus'],
) {
  switch (status) {
    case 'VERIFIED':
      return 'Identidad verificada';

    case 'PENDING':
      return 'Identidad pendiente';

    case 'REJECTED':
      return 'Identidad rechazada';

    default:
      return 'Sin identidad académica';
  }
}

export function AdminMembersPage({
  institutionId,
  institutionName,
  role,
  currentUserId,
}: AdminMembersPageProps) {
  const [state, setState] = useState<LoadState>({
    status: 'loading',
  });
  const [pending, setPending] = useState<PendingAction | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(
    null,
  );

  const otherRole: MemberRole =
    role === 'TEACHER' ? 'STUDENT' : 'TEACHER';

  const loadMembers = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/members?role=${role}`,
        {
          credentials: 'same-origin',
        },
      );

      if (!response.ok) {
        throw new Error('Member listing failed');
      }

      const body = (await response.json()) as {
        members: InstitutionMember[];
      };

      setState({
        status: 'ready',
        members: body.members,
      });
    } catch {
      setState({
        status: 'error',
        message:
          'No pudimos cargar los miembros de esta institución.',
      });
    }
  }, [institutionId, role]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function confirmAction(action: PendingAction) {
    setBusy(true);
    setActionError(null);

    const path =
      action.kind === 'revoke' ? 'revoke' : 'role';

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/members/${action.membershipId}/${path}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action.kind === 'role' ? { role: otherRole } : {},
          ),
        },
      );

      if (!response.ok) {
        throw new Error('Action failed');
      }

      setPending(null);
      await loadMembers();
    } catch {
      setActionError(
        'No pudimos aplicar el cambio. Recarga la lista e inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  const isTeacher = role === 'TEACHER';

  const title = isTeacher
    ? 'Profesores'
    : 'Estudiantes';

  const singular = isTeacher
    ? 'profesor'
    : 'estudiante';

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">
            ADMINISTRACIÓN
          </p>

          <h1>{title}</h1>

          <p>
            Miembros activos de {institutionName} con rol de{' '}
            {singular}.
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">
              MIEMBROS ACTIVOS
            </p>

            <h2>{title} registrados</h2>
          </div>

          {state.status === 'ready' && (
            <span className="request-count">
              {state.members.length}{' '}
              {state.members.length === 1
                ? singular
                : title.toLowerCase()}
            </span>
          )}
        </div>

        {state.status === 'loading' && (
          <div className="admin-loading">
            <div className="loader" />
            <span>Cargando miembros…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="admin-error-state">
            <strong>
              No pudimos cargar {title.toLowerCase()}.
            </strong>

            <span>{state.message}</span>

            <button
              type="button"
              onClick={() => void loadMembers()}
            >
              Reintentar
            </button>
          </div>
        )}

        {state.status === 'ready' &&
          state.members.length === 0 && (
            <div className="empty-admin-state large">
              <div className="empty-admin-letter">
                {isTeacher ? 'P' : 'E'}
              </div>

              <strong>
                No hay {title.toLowerCase()} activos
              </strong>

              <p>
                Los usuarios aparecerán aquí después de
                aprobar su solicitud con este rol.
              </p>
            </div>
          )}

        {actionError && (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        )}

        {state.status === 'ready' &&
          state.members.length > 0 && (
            <div className="member-list">
              {state.members.map(member => {
                const isSelf = member.userId === currentUserId;
                const confirming =
                  pending?.membershipId === member.membershipId
                    ? pending
                    : null;

                return (
                <div
                  className="member-item"
                  key={member.membershipId}
                >
                <article className="member-row">
                  <div className="member-user">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                      />
                    ) : (
                      <div className="request-avatar">
                        {member.githubLogin
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}

                    <div>
                      <strong>
                        @{member.githubLogin}
                      </strong>

                      <span>
                        Ingresó{' '}
                        {formatDate(member.joinedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="member-role">
                    <span className="status-pill active">
                      {isTeacher
                        ? 'Profesor'
                        : 'Estudiante'}
                    </span>
                  </div>

                  <div className="member-identity">
                    <strong>
                      {member.institutionalIdentifier ??
                        'Sin identificador'}
                    </strong>

                    <span>
                      {identityLabel(
                        member.academicIdentityStatus,
                      )}
                    </span>
                  </div>

                  {!isSelf && (
                    <div className="member-actions">
                      <button
                        type="button"
                        className="approve-button secondary"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            membershipId: member.membershipId,
                            kind: 'role',
                          })
                        }
                      >
                        Pasar a{' '}
                        {otherRole === 'TEACHER'
                          ? 'profesor'
                          : 'estudiante'}
                      </button>
                      <button
                        type="button"
                        className="deny-button"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            membershipId: member.membershipId,
                            kind: 'revoke',
                          })
                        }
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </article>

                {confirming && (
                  <div className="member-confirm" role="alertdialog">
                    <span>
                      {confirming.kind === 'revoke'
                        ? `¿Remover a @${member.githubLogin} como ${singular} de ${institutionName}? Su cuenta se conserva y podrá volver a solicitar acceso.`
                        : `¿Cambiar a @${member.githubLogin} de ${singular} a ${otherRole === 'TEACHER' ? 'profesor' : 'estudiante'}?`}
                    </span>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={busy}
                        onClick={() => setPending(null)}
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        className={
                          confirming.kind === 'revoke'
                            ? 'deny-button'
                            : 'primary-action'
                        }
                        disabled={busy}
                        onClick={() => void confirmAction(confirming)}
                      >
                        {busy ? 'Aplicando…' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
                </div>
                );
              })}
            </div>
          )}
      </section>
    </div>
  );
}
