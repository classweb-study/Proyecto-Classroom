import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import {
  ACTIVITY_STATUS_LABEL,
  KIND_LABEL,
  STATE_CLASS,
  STATE_LABEL,
  ApiError,
  api,
  errorMessage,
  formatDate,
  type Activity,
  type CourseDetail,
  type CourseRole,
  type CourseSummary,
  type Navigate,
} from '../lib/api';
import { ActivityForm } from '../components/ActivityForm';
import { ActivityPage } from './ActivityPage';

type CoursesSectionProps = {
  institutionId: string;
  role: CourseRole;
  courseId?: string;
  activityId?: string;
  navigate: Navigate;
};

export function CoursesSection(props: CoursesSectionProps) {
  if (props.courseId && props.activityId) {
    return (
      <ActivityPage
        activityId={props.activityId}
        onBack={() =>
          props.navigate({ page: 'courses', courseId: props.courseId })
        }
      />
    );
  }

  if (props.courseId) {
    return (
      <CoursePage
        courseId={props.courseId}
        navigate={props.navigate}
      />
    );
  }

  return <CourseList {...props} />;
}

function CourseList({ institutionId, role, navigate }: CoursesSectionProps) {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    api<{ courses: CourseSummary[] }>(
      `/courses?institutionId=${institutionId}`,
    )
      .then(body => setCourses(body.courses))
      .catch(() => setLoadFailed(true));
  }, [institutionId]);

  useEffect(load, [load]);

  const visible = (courses ?? []).filter(
    course =>
      course.viewerRole === role &&
      (showArchived || course.status === 'ACTIVE'),
  );

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">
            {role === 'TEACHER' ? 'PROFESOR' : 'ESTUDIANTE'}
          </p>
          <h1>Cursos</h1>
          <p>
            {role === 'TEACHER'
              ? 'Crea y gestiona tus cursos, matrículas y actividades.'
              : 'Tus materias. Para unirte a una nueva usa el código que te dio tu profesor.'}
          </p>
        </div>
      </section>

      {role === 'TEACHER' ? (
        <CreateCourseForm
          institutionId={institutionId}
          onCreated={courseId => navigate({ page: 'courses', courseId })}
        />
      ) : (
        <JoinCourseForm
          onJoined={courseId => navigate({ page: 'courses', courseId })}
        />
      )}

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">LISTADO</p>
            <h2>Mis cursos</h2>
          </div>
          {role === 'TEACHER' && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={event => setShowArchived(event.target.checked)}
              />
              Mostrar archivados
            </label>
          )}
        </div>

        {loadFailed && (
          <div className="admin-error-state">
            <strong>No pudimos cargar los cursos.</strong>
            <button type="button" onClick={load}>
              Reintentar
            </button>
          </div>
        )}

        {!courses && !loadFailed && (
          <div className="admin-loading">
            <div className="loader" />
            <span>Cargando cursos…</span>
          </div>
        )}

        {courses && visible.length === 0 && (
          <p className="field-hint">No hay cursos para mostrar.</p>
        )}

        {visible.length > 0 && (
          <div className="course-grid">
            {visible.map(course => (
              <button
                type="button"
                key={course.id}
                className="course-card"
                onClick={() =>
                  navigate({ page: 'courses', courseId: course.id })
                }
              >
                <strong>{course.name}</strong>
                {course.code && (
                  <span className="muted">{course.code}</span>
                )}
                <span className="muted">
                  {course.activityCount} actividades ·{' '}
                  {course.studentCount} estudiantes
                </span>
                {course.status === 'ARCHIVED' && (
                  <span className="status-pill request-cancelled">
                    Archivado
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CreateCourseForm({
  institutionId,
  onCreated,
}: {
  institutionId: string;
  onCreated: (courseId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const body = await api<{ courseId: string }>('/courses', {
        method: 'POST',
        body: { institutionId, name, code, description },
      });
      onCreated(body.courseId);
    } catch (submitError) {
      setError(errorMessage(submitError, 'No pudimos crear el curso.'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="form-actions start">
        <button
          type="button"
          className="primary-action"
          onClick={() => setOpen(true)}
        >
          Crear curso
        </button>
      </div>
    );
  }

  return (
    <form className="admin-panel stack-form" onSubmit={submit}>
      <h2>Nuevo curso</h2>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="course-name">Nombre</label>
          <input
            id="course-name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="course-code">Código (opcional)</label>
          <input
            id="course-code"
            maxLength={40}
            placeholder="Ej.: PRG-101"
            value={code}
            onChange={event => setCode(event.target.value)}
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="course-description">Descripción (opcional)</label>
        <textarea
          id="course-description"
          rows={3}
          maxLength={4000}
          value={description}
          onChange={event => setDescription(event.target.value)}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="secondary-action"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
        <button type="submit" className="primary-action" disabled={busy}>
          {busy ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </form>
  );
}

function JoinCourseForm({
  onJoined,
}: {
  onJoined: (courseId: string) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const body = await api<{ courseId: string }>('/courses/join', {
        method: 'POST',
        body: { code },
      });
      onJoined(body.courseId);
    } catch (joinError) {
      setError(
        joinError instanceof ApiError && joinError.code === 'NOT_FOUND'
          ? 'Código no válido, o el curso no acepta inscripciones en este momento.'
          : errorMessage(joinError, 'No pudimos inscribirte en el curso.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel join-form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="join-code">Código del curso</label>
        <input
          id="join-code"
          required
          maxLength={14}
          autoComplete="off"
          placeholder="Ej.: K7M2QX9P"
          value={code}
          onChange={event => setCode(event.target.value.toUpperCase())}
        />
      </div>
      <button type="submit" className="primary-action" disabled={busy}>
        {busy ? 'Uniéndote…' : 'Unirme'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

type Tab = 'activities' | 'members' | 'settings';

function CoursePage({
  courseId,
  navigate,
}: {
  courseId: string;
  navigate: Navigate;
}) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('activities');

  const load = useCallback(() => {
    setLoadFailed(false);
    api<{ course: CourseDetail }>(`/courses/${courseId}`)
      .then(body => setCourse(body.course))
      .catch(() => setLoadFailed(true));
  }, [courseId]);

  useEffect(load, [load]);

  if (loadFailed) {
    return (
      <div className="admin-page">
        <button
          type="button"
          className="link-button back-link"
          onClick={() => navigate({ page: 'courses' })}
        >
          ← Cursos
        </button>
        <div className="admin-error-state">
          <strong>No encontramos este curso.</strong>
          <span>Puede que ya no tengas acceso.</span>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="admin-loading">
        <div className="loader" />
        <span>Cargando curso…</span>
      </div>
    );
  }

  const teacher = course.viewerRole === 'TEACHER';
  const faculty = course.roster.filter(member => member.role === 'TEACHER');
  const students = course.roster.filter(member => member.role === 'STUDENT');

  return (
    <div className="admin-page">
      <button
        type="button"
        className="link-button back-link"
        onClick={() => navigate({ page: 'courses' })}
      >
        ← Cursos
      </button>

      <section className="page-heading">
        <div>
          <p className="page-kicker">
            {course.code ?? 'CURSO'}
            {course.status === 'ARCHIVED' && ' · ARCHIVADO'}
          </p>
          <h1>{course.name}</h1>
          <p>{faculty.length > 1 ? 'Profesores' : 'Profesor'}: {faculty.length
            ? faculty.map(member => member.name ?? 'Nombre pendiente').join(', ')
            : 'Sin profesor activo'}</p>
          {course.description && <p>{course.description}</p>}
        </div>

        {teacher && course.joinCode && (
          <div className="join-code-box">
            <span>Código para estudiantes</span>
            <strong>{course.joinEnabled ? course.joinCode : 'Desactivado'}</strong>
          </div>
        )}
      </section>

      {teacher && (
        <div className="tab-bar" role="tablist">
          {(
            [
              ['activities', 'Actividades'],
              ['members', 'Estudiantes'],
              ['settings', 'Configuración'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'tab active' : 'tab'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!teacher && (
        <section className="admin-panel">
          <h2>Estudiantes de la clase ({students.length})</h2>
          <ul className="plain-list">
            {students.map(member => <li key={member.memberId}>
              {member.name ?? 'Nombre pendiente'}{member.isSelf && ' (tú)'}
            </li>)}
          </ul>
        </section>
      )}

      {(tab === 'activities' || !teacher) && (
        <ActivitiesPanel
          course={course}
          onOpen={activityId =>
            navigate({ page: 'courses', courseId, activityId })
          }
        />
      )}

      {teacher && tab === 'members' && <MembersPanel courseId={courseId} />}

      {teacher && tab === 'settings' && (
        <CourseSettings course={course} onChanged={load} />
      )}
    </div>
  );
}

function ActivitiesPanel({
  course,
  onOpen,
}: {
  course: CourseDetail;
  onOpen: (activityId: string) => void;
}) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [creating, setCreating] = useState(false);
  const teacher = course.viewerRole === 'TEACHER';

  const load = useCallback(() => {
    api<{ activities: Activity[] }>(`/courses/${course.id}/activities`)
      .then(body => setActivities(body.activities))
      .catch(() => setActivities([]));
  }, [course.id]);

  useEffect(load, [load]);

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="page-kicker">TRABAJO</p>
          <h2>Actividades</h2>
        </div>
        {teacher && course.status === 'ACTIVE' && !creating && (
          <button
            type="button"
            className="primary-action"
            onClick={() => setCreating(true)}
          >
            Nueva actividad
          </button>
        )}
      </div>

      {creating && (
        <ActivityForm
          submitLabel="Crear actividad"
          onCancel={() => setCreating(false)}
          onSubmit={async activity => {
            await api(`/courses/${course.id}/activities`, {
              method: 'POST',
              body: activity,
            });
            setCreating(false);
            load();
          }}
        />
      )}

      {!activities && (
        <div className="admin-loading">
          <div className="loader" />
          <span>Cargando actividades…</span>
        </div>
      )}

      {activities && activities.length === 0 && (
        <p className="field-hint">
          {teacher
            ? 'Aún no hay actividades. Las que estén en borrador no las ven los estudiantes.'
            : 'Tu profesor todavía no ha publicado actividades.'}
        </p>
      )}

      {activities && activities.length > 0 && (
        <ul className="link-list">
          {activities.map(activity => (
            <li key={activity.id}>
              <button type="button" onClick={() => onOpen(activity.id)}>
                <strong>{activity.title}</strong>
                <span>
                  {KIND_LABEL[activity.kind]} · Entrega:{' '}
                  {formatDate(activity.dueAt)}
                </span>
                <span className="pill-row">
                  {teacher ? (
                    <span
                      className={`status-pill ${activity.status === 'PUBLISHED' ? 'active' : 'pending'}`}
                    >
                      {ACTIVITY_STATUS_LABEL[activity.status]}
                    </span>
                  ) : (
                    activity.myState && (
                      <span
                        className={`status-pill ${STATE_CLASS[activity.myState]}`}
                      >
                        {STATE_LABEL[activity.myState]}
                        {activity.myScore !== null &&
                          activity.myScore !== undefined &&
                          ` · ${activity.myScore}`}
                      </span>
                    )
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Member = {
  memberId: string;
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
  displayName: string | null;
  role: CourseRole;
  groupName: string | null;
  joinedAt: string;
};

type Candidate = {
  userId: string;
  githubLogin: string;
  displayName: string | null;
};

function MembersPanel({ courseId }: { courseId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [addRole, setAddRole] = useState<CourseRole>('STUDENT');
  const [selected, setSelected] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ members: Member[] }>(`/courses/${courseId}/members`)
      .then(body => setMembers(body.members))
      .catch(() => setMembers([]));
  }, [courseId]);

  useEffect(load, [load]);

  useEffect(() => {
    setSelected('');
    api<{ candidates: Candidate[] }>(
      `/courses/${courseId}/candidates?role=${addRole}`,
    )
      .then(body => setCandidates(body.candidates))
      .catch(() => setCandidates([]));
  }, [courseId, addRole, members]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      load();
    } catch (runError) {
      setError(errorMessage(runError, 'No pudimos aplicar el cambio.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="page-kicker">MATRÍCULA</p>
          <h2>Participantes</h2>
        </div>
      </div>

      <form
        className="inline-form"
        onSubmit={event => {
          event.preventDefault();
          if (!selected) return;
          void run(() =>
            api(`/courses/${courseId}/members`, {
              method: 'POST',
              body: { userId: selected, role: addRole },
            }),
          );
        }}
      >
        <div className="form-field">
          <label htmlFor="add-role">Agregar</label>
          <select
            id="add-role"
            value={addRole}
            onChange={event => setAddRole(event.target.value as CourseRole)}
          >
            <option value="STUDENT">Estudiante</option>
            <option value="TEACHER">Profesor (co-docente)</option>
          </select>
        </div>
        <div className="form-field grow">
          <label htmlFor="add-user">Persona de la institución</label>
          <select
            id="add-user"
            value={selected}
            onChange={event => setSelected(event.target.value)}
          >
            <option value="">
              {candidates.length === 0
                ? 'No hay personas disponibles'
                : 'Selecciona…'}
            </option>
            {candidates.map(candidate => (
              <option key={candidate.userId} value={candidate.userId}>
                {candidate.displayName
                  ? `${candidate.displayName} (@${candidate.githubLogin})`
                  : `@${candidate.githubLogin}`}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="primary-action"
          disabled={busy || !selected}
        >
          Agregar
        </button>
      </form>
      <p className="field-hint">
        Solo aparecen personas aprobadas en la institución. Los
        estudiantes también pueden unirse con el código del curso.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!members && (
        <div className="admin-loading">
          <div className="loader" />
          <span>Cargando participantes…</span>
        </div>
      )}

      {members && (
        <div className="member-list">
          {members.map(member => (
            <div className="member-item" key={member.memberId}>
              <article className="member-row">
                <div className="member-user">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" />
                  ) : (
                    <div className="request-avatar">
                      {member.githubLogin.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <strong>
                      {member.displayName ?? `@${member.githubLogin}`}
                    </strong>
                    <span>
                      @{member.githubLogin} · desde{' '}
                      {formatDate(member.joinedAt)}
                    </span>
                  </div>
                </div>

                <div className="member-role">
                  <span className="status-pill active">
                    {member.role === 'TEACHER' ? 'Profesor' : 'Estudiante'}
                  </span>
                </div>

                <div className="member-identity">
                  {member.role === 'STUDENT' && (
                    <GroupEditor
                      value={member.groupName}
                      disabled={busy}
                      onSave={groupName =>
                        run(() =>
                          api(
                            `/courses/${courseId}/members/${member.memberId}`,
                            { method: 'PATCH', body: { groupName } },
                          ),
                        )
                      }
                    />
                  )}
                </div>

                <div className="member-actions">
                  <button
                    type="button"
                    className="deny-button"
                    disabled={busy}
                    onClick={() => setRemoving(member.memberId)}
                  >
                    Quitar
                  </button>
                </div>
              </article>

              {removing === member.memberId && (
                <div className="member-confirm" role="alertdialog">
                  <span>
                    ¿Quitar a @{member.githubLogin} del curso? No podrá
                    volver a entrar con el código; solo tú podrás
                    agregarlo de nuevo.
                  </span>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => setRemoving(null)}
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      className="deny-button"
                      disabled={busy}
                      onClick={() => {
                        setRemoving(null);
                        void run(() =>
                          api(
                            `/courses/${courseId}/members/${member.memberId}`,
                            { method: 'DELETE' },
                          ),
                        );
                      }}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupEditor({
  value,
  disabled,
  onSave,
}: {
  value: string | null;
  disabled: boolean;
  onSave: (groupName: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => setDraft(value ?? ''), [value]);

  return (
    <form
      className="group-editor"
      onSubmit={event => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <input
        aria-label="Grupo"
        placeholder="Grupo"
        maxLength={60}
        value={draft}
        onChange={event => setDraft(event.target.value)}
      />
      {draft !== (value ?? '') && (
        <button type="submit" className="link-button" disabled={disabled}>
          Guardar
        </button>
      )}
    </form>
  );
}

function CourseSettings({
  course,
  onChanged,
}: {
  course: CourseDetail;
  onChanged: () => void;
}) {
  const [name, setName] = useState(course.name);
  const [code, setCode] = useState(course.code ?? '');
  const [description, setDescription] = useState(course.description ?? '');
  const [joinEnabled, setJoinEnabled] = useState(course.joinEnabled);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { kind: 'ok' | 'error'; text: string } | null
  >(null);

  async function run(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage({ kind: 'ok', text: ok });
      onChanged();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'No pudimos guardar los cambios.'),
      });
    } finally {
      setBusy(false);
    }
  }

  const archived = course.status === 'ARCHIVED';

  return (
    <>
      <form
        className="admin-panel stack-form"
        onSubmit={event => {
          event.preventDefault();
          void run(
            () =>
              api(`/courses/${course.id}`, {
                method: 'PATCH',
                body: { name, code, description, joinEnabled },
              }),
            'Curso actualizado.',
          );
        }}
      >
        <h2>Datos del curso</h2>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="edit-course-name">Nombre</label>
            <input
              id="edit-course-name"
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-course-code">Código</label>
            <input
              id="edit-course-code"
              maxLength={40}
              value={code}
              onChange={event => setCode(event.target.value)}
            />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="edit-course-description">Descripción</label>
          <textarea
            id="edit-course-description"
            rows={3}
            maxLength={4000}
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={joinEnabled}
            onChange={event => setJoinEnabled(event.target.checked)}
          />
          Permitir que los estudiantes se unan con el código
        </label>

        {message && (
          <p
            className={message.kind === 'ok' ? 'form-success' : 'form-error'}
            role="status"
          >
            {message.text}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  api(`/courses/${course.id}/join-code`, { method: 'POST' }),
                'Nuevo código generado. El anterior ya no funciona.',
              )
            }
          >
            Generar nuevo código
          </button>
          <button type="submit" className="primary-action" disabled={busy}>
            Guardar
          </button>
        </div>
      </form>

      <section className="admin-panel">
        <h2>{archived ? 'Curso archivado' : 'Archivar curso'}</h2>
        <p className="field-hint">
          {archived
            ? 'Los estudiantes pueden consultar el curso pero no entregar. Puedes reactivarlo cuando quieras.'
            : 'Al archivarlo, nadie puede entregar ni crear actividades. No se borra nada.'}
        </p>
        {confirmArchive ? (
          <div className="member-confirm" role="alertdialog">
            <span>¿Archivar «{course.name}»?</span>
            <div className="form-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setConfirmArchive(false)}
              >
                Volver
              </button>
              <button
                type="button"
                className="deny-button"
                disabled={busy}
                onClick={() => {
                  setConfirmArchive(false);
                  void run(
                    () =>
                      api(`/courses/${course.id}/archive`, { method: 'POST' }),
                    'Curso archivado.',
                  );
                }}
              >
                Archivar
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions start">
            <button
              type="button"
              className={archived ? 'primary-action' : 'deny-button'}
              disabled={busy}
              onClick={() =>
                archived
                  ? void run(
                      () =>
                        api(`/courses/${course.id}/unarchive`, {
                          method: 'POST',
                        }),
                      'Curso reactivado.',
                    )
                  : setConfirmArchive(true)
              }
            >
              {archived ? 'Reactivar curso' : 'Archivar curso'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
