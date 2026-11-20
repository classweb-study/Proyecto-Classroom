import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import { ActivityForm } from '../components/ActivityForm';
import {
  ACTIVITY_STATUS_LABEL,
  KIND_LABEL,
  STATE_CLASS,
  STATE_LABEL,
  api,
  errorMessage,
  formatDate,
  type Activity,
  type CourseRole,
  type Submission,
  type SubmissionState,
} from '../lib/api';

type ActivityPageProps = {
  activityId: string;
  onBack: () => void;
};

type Loaded = {
  role: CourseRole;
  activity: Activity;
  courseName: string;
};

export function ActivityPage({ activityId, onBack }: ActivityPageProps) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<Loaded>(`/activities/${activityId}`)
      .then(setData)
      .catch(() => setLoadFailed(true));
  }, [activityId]);

  useEffect(load, [load]);

  if (loadFailed) {
    return (
      <div className="admin-page">
        <button type="button" className="link-button back-link" onClick={onBack}>
          ← Volver al curso
        </button>
        <div className="admin-error-state">
          <strong>No encontramos esta actividad.</strong>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-loading">
        <div className="loader" />
        <span>Cargando actividad…</span>
      </div>
    );
  }

  const { activity, role } = data;
  const pastDue =
    activity.dueAt !== null && new Date(activity.dueAt) < new Date();

  return (
    <div className="admin-page">
      <button type="button" className="link-button back-link" onClick={onBack}>
        ← {data.courseName}
      </button>

      <section className="page-heading">
        <div>
          <p className="page-kicker">
            {KIND_LABEL[activity.kind].toUpperCase()}
            {role === 'TEACHER' &&
              ` · ${ACTIVITY_STATUS_LABEL[activity.status].toUpperCase()}`}
          </p>
          <h1>{activity.title}</h1>
          <p>
            Entrega: {formatDate(activity.dueAt)}
            {pastDue && ' (vencida)'}
            {activity.maxScore !== null && ` · Nota máxima ${activity.maxScore}`}
            {activity.dueAt &&
              (activity.allowLate
                ? ' · Acepta entregas tardías'
                : ' · No acepta entregas tardías')}
          </p>
        </div>
        {role === 'TEACHER' && !editing && (
          <button
            type="button"
            className="secondary-action"
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
        )}
      </section>

      {editing ? (
        <section className="admin-panel">
          <ActivityForm
            initial={activity}
            submitLabel="Guardar cambios"
            onCancel={() => setEditing(false)}
            onSubmit={async payload => {
              await api(`/activities/${activityId}`, {
                method: 'PATCH',
                body: payload,
              });
              setEditing(false);
              load();
            }}
          />
        </section>
      ) : (
        <section className="admin-panel">
          <h2>Instrucciones</h2>
          <p className="pre-wrap">{activity.instructions}</p>

          {activity.templateRepoUrl && (
            <p>
              Repositorio plantilla:{' '}
              <a
                href={activity.templateRepoUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {activity.templateRepoUrl}
              </a>
            </p>
          )}

          {activity.resourceUrl && (
            <p>
              Recurso:{' '}
              <a
                href={activity.resourceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {activity.resourceUrl}
              </a>
            </p>
          )}

          {activity.rubric && (
            <>
              <h3 className="sub-heading">Rúbrica</h3>
              <p className="pre-wrap">{activity.rubric}</p>
            </>
          )}
        </section>
      )}

      {role === 'STUDENT' ? (
        <StudentSubmissions activity={activity} pastDue={pastDue} />
      ) : (
        <TeacherSubmissions activity={activity} />
      )}
    </div>
  );
}

function SubmissionContent({ submission }: { submission: Submission }) {
  return (
    <>
      {submission.contentUrl && (
        <a
          href={submission.contentUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          {submission.contentUrl}
        </a>
      )}
      {submission.commitSha && (
        <code className="commit-sha">{submission.commitSha.slice(0, 12)}</code>
      )}
      {submission.textContent && (
        <p className="pre-wrap">{submission.textContent}</p>
      )}
    </>
  );
}

function StudentSubmissions({
  activity,
  pastDue,
}: {
  activity: Activity;
  pastDue: boolean;
}) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [contentUrl, setContentUrl] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [textContent, setTextContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { kind: 'ok' | 'error'; text: string } | null
  >(null);

  const load = useCallback(() => {
    api<{ submissions: Submission[] }>(
      `/activities/${activity.id}/my-submissions`,
    )
      .then(body => setSubmissions(body.submissions))
      .catch(() => setSubmissions([]));
  }, [activity.id]);

  useEffect(load, [load]);

  const closed = pastDue && !activity.allowLate;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const body = await api<{ attempt: number; isLate: boolean }>(
        `/activities/${activity.id}/submissions`,
        {
          method: 'POST',
          body:
            activity.kind === 'TEXT'
              ? { textContent }
              : activity.kind === 'REPOSITORY'
                ? { contentUrl, commitSha }
                : { contentUrl },
        },
      );
      setMessage({
        kind: 'ok',
        text: `Entrega recibida (intento ${body.attempt}${body.isLate ? ', tardía' : ''}).`,
      });
      setCommitSha('');
      load();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'No pudimos registrar tu entrega.'),
      });
    } finally {
      setBusy(false);
    }
  }

  const latest = submissions?.[0];

  return (
    <>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">MI ENTREGA</p>
            <h2>{latest ? 'Volver a entregar' : 'Entregar'}</h2>
          </div>
        </div>

        {closed ? (
          <p className="field-hint">
            La fecha de entrega ya pasó y esta actividad no acepta
            entregas tardías.
          </p>
        ) : (
          <form className="stack-form" onSubmit={submit}>
            {activity.kind === 'TEXT' ? (
              <div className="form-field">
                <label htmlFor="submission-text">Tu respuesta</label>
                <textarea
                  id="submission-text"
                  required
                  rows={6}
                  maxLength={20000}
                  value={textContent}
                  onChange={event => setTextContent(event.target.value)}
                />
              </div>
            ) : (
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="submission-url">
                    {activity.kind === 'REPOSITORY'
                      ? 'URL de tu repositorio en GitHub'
                      : 'Enlace de tu trabajo'}
                  </label>
                  <input
                    id="submission-url"
                    type="url"
                    required
                    maxLength={500}
                    placeholder={
                      activity.kind === 'REPOSITORY'
                        ? 'https://github.com/tu-usuario/tu-repo'
                        : 'https://…'
                    }
                    value={contentUrl}
                    onChange={event => setContentUrl(event.target.value)}
                  />
                </div>
                {activity.kind === 'REPOSITORY' && (
                  <div className="form-field">
                    <label htmlFor="submission-commit">
                      Commit entregado (opcional)
                    </label>
                    <input
                      id="submission-commit"
                      maxLength={40}
                      placeholder="Ej.: 3f2a9c1"
                      value={commitSha}
                      onChange={event => setCommitSha(event.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {activity.kind === 'REPOSITORY' && (
              <p className="field-hint">
                Asegúrate de que tu profesor pueda ver el repositorio
                (público o con acceso concedido). VMAT todavía no
                comprueba la visibilidad del repositorio en GitHub.
              </p>
            )}

            {pastDue && (
              <p className="field-hint">
                La fecha ya pasó: esta entrega quedará marcada como
                tardía.
              </p>
            )}

            {message && (
              <p
                className={message.kind === 'ok' ? 'form-success' : 'form-error'}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="form-actions">
              <button type="submit" className="primary-action" disabled={busy}>
                {busy ? 'Enviando…' : 'Confirmar entrega'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">HISTORIAL</p>
            <h2>Mis entregas</h2>
          </div>
        </div>

        {!submissions && (
          <div className="admin-loading">
            <div className="loader" />
          </div>
        )}

        {submissions && submissions.length === 0 && (
          <p className="field-hint">Aún no has entregado esta actividad.</p>
        )}

        {submissions && submissions.length > 0 && (
          <ol className="submission-history">
            {submissions.map(submission => (
              <li key={submission.id}>
                <div className="submission-meta">
                  <strong>Intento {submission.attempt}</strong>
                  <span>{formatDate(submission.submittedAt)}</span>
                  {submission.isLate && (
                    <span className="status-pill request-denied">Tardía</span>
                  )}
                  {submission.reviewedAt && (
                    <span className="status-pill request-approved">
                      Revisada
                      {submission.score !== null &&
                        ` · ${submission.score}${activity.maxScore ? ` / ${activity.maxScore}` : ''}`}
                    </span>
                  )}
                </div>
                <SubmissionContent submission={submission} />
                {submission.feedback && (
                  <blockquote className="feedback">
                    {submission.feedback}
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

type StudentRow = {
  userId: string;
  githubLogin: string;
  displayName: string | null;
  groupName: string | null;
  state: SubmissionState;
  attempts: number;
  latest: Submission | null;
};

function TeacherSubmissions({ activity }: { activity: Activity }) {
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [filter, setFilter] = useState<SubmissionState | 'ALL'>('ALL');
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ students: StudentRow[] }>(`/activities/${activity.id}/submissions`)
      .then(body => setRows(body.students))
      .catch(() => setRows([]));
  }, [activity.id]);

  useEffect(load, [load]);

  const counts = (rows ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.state] = (acc[row.state] ?? 0) + 1;
    return acc;
  }, {});

  const visible = (rows ?? []).filter(
    row => filter === 'ALL' || row.state === filter,
  );

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="page-kicker">SEGUIMIENTO</p>
          <h2>Entregas por estudiante</h2>
        </div>
        <div className="form-field compact">
          <label htmlFor="submission-filter" className="visually-hidden">
            Filtrar
          </label>
          <select
            id="submission-filter"
            value={filter}
            onChange={event =>
              setFilter(event.target.value as SubmissionState | 'ALL')
            }
          >
            <option value="ALL">Todos ({rows?.length ?? 0})</option>
            {(Object.keys(STATE_LABEL) as SubmissionState[]).map(state => (
              <option key={state} value={state}>
                {STATE_LABEL[state]} ({counts[state] ?? 0})
              </option>
            ))}
          </select>
        </div>
      </div>

      {activity.status !== 'PUBLISHED' && (
        <p className="field-hint">
          Esta actividad no está publicada: los estudiantes no la ven.
        </p>
      )}

      {!rows && (
        <div className="admin-loading">
          <div className="loader" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="field-hint">El curso todavía no tiene estudiantes.</p>
      )}

      {visible.length > 0 && (
        <div className="member-list">
          {visible.map(row => (
            <div className="member-item" key={row.userId}>
              <article className="submission-row">
                <div className="member-user">
                  <div>
                    <strong>{row.displayName ?? `@${row.githubLogin}`}</strong>
                    <span>
                      @{row.githubLogin}
                      {row.groupName && ` · ${row.groupName}`}
                      {row.attempts > 1 && ` · ${row.attempts} intentos`}
                    </span>
                  </div>
                </div>
                <div className="submission-detail">
                  {row.latest ? (
                    <>
                      <SubmissionContent submission={row.latest} />
                      <span className="muted">
                        {formatDate(row.latest.submittedAt)}
                      </span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
                <span className={`status-pill ${STATE_CLASS[row.state]}`}>
                  {STATE_LABEL[row.state]}
                  {row.latest?.score !== null &&
                    row.latest?.score !== undefined &&
                    ` · ${row.latest.score}`}
                </span>
                {row.latest && (
                  <button
                    type="button"
                    className="approve-button secondary"
                    onClick={() =>
                      setReviewing(reviewing === row.userId ? null : row.userId)
                    }
                  >
                    {row.latest.reviewedAt ? 'Editar revisión' : 'Revisar'}
                  </button>
                )}
              </article>

              {reviewing === row.userId && row.latest && (
                <ReviewForm
                  submission={row.latest}
                  maxScore={activity.maxScore}
                  onDone={() => {
                    setReviewing(null);
                    load();
                  }}
                  onCancel={() => setReviewing(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewForm({
  submission,
  maxScore,
  onDone,
  onCancel,
}: {
  submission: Submission;
  maxScore: number | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [score, setScore] = useState(
    submission.score === null ? '' : String(submission.score),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api(`/submissions/${submission.id}/review`, {
        method: 'POST',
        body: { feedback, score: score === '' ? null : Number(score) },
      });
      onDone();
    } catch (reviewError) {
      setError(errorMessage(reviewError, 'No pudimos guardar la revisión.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="member-confirm review-form" onSubmit={submit}>
      <div className="form-field grow">
        <label htmlFor={`feedback-${submission.id}`}>
          Comentarios para el estudiante
        </label>
        <textarea
          id={`feedback-${submission.id}`}
          rows={3}
          maxLength={5000}
          value={feedback}
          onChange={event => setFeedback(event.target.value)}
        />
      </div>
      <div className="form-field compact">
        <label htmlFor={`score-${submission.id}`}>
          Nota{maxScore ? ` (máx. ${maxScore})` : ''}
        </label>
        <input
          id={`score-${submission.id}`}
          type="number"
          min={0}
          max={maxScore ?? 9999}
          step={0.01}
          value={score}
          onChange={event => setScore(event.target.value)}
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
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button type="submit" className="primary-action" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar revisión'}
        </button>
      </div>
    </form>
  );
}
