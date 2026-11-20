import { useEffect, useState } from 'react';

import {
  api,
  formatDate,
  type CourseSummary,
  type DashboardActivity,
  type Navigate,
} from '../lib/api';

type Preferences = { notifyDeadlines: boolean; notifyFeedback: boolean };

type StudentDashboard = {
  courses: CourseSummary[];
  upcoming: DashboardActivity[];
  overdue: DashboardActivity[];
  recentFeedback: Array<
    DashboardActivity & {
      score: number | null;
      maxScore: number | null;
      reviewedAt: string;
    }
  >;
};

type TeacherDashboard = {
  courses: CourseSummary[];
  toReview: Array<DashboardActivity & { pending: number }>;
  upcoming: DashboardActivity[];
  missingAfterDue: Array<DashboardActivity & { missing: number }>;
};

type HomeProps = {
  institutionId: string;
  institutionName: string;
  navigate: Navigate;
};

function useDashboard<T>(institutionId: string, role: 'STUDENT' | 'TEACHER') {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; dashboard: T; preferences: Preferences }
    | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    Promise.all([
      api<{ dashboard: T }>(
        `/me/dashboard?institutionId=${institutionId}&role=${role}`,
      ),
      api<{ profile: Preferences }>('/me/profile'),
    ])
      .then(([dashboard, profile]) => {
        if (!cancelled) {
          setState({
            status: 'ready',
            dashboard: dashboard.dashboard,
            preferences: profile.profile,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, role]);

  return state;
}

function ActivityList({
  items,
  navigate,
  empty,
  extra,
}: {
  items: DashboardActivity[];
  navigate: Navigate;
  empty: string;
  extra?: (item: DashboardActivity) => string | null;
}) {
  if (items.length === 0) {
    return <p className="field-hint">{empty}</p>;
  }

  return (
    <ul className="link-list">
      {items.map(item => (
        <li key={item.activityId}>
          <button
            type="button"
            onClick={() =>
              navigate({
                page: 'courses',
                courseId: item.courseId,
                activityId: item.activityId,
              })
            }
          >
            <strong>{item.title}</strong>
            <span>
              {item.courseName} · {formatDate(item.dueAt)}
              {extra?.(item) ? ` · ${extra(item)}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CourseCards({
  courses,
  navigate,
}: {
  courses: CourseSummary[];
  navigate: Navigate;
}) {
  return (
    <div className="course-grid">
      {courses.map(course => (
        <button
          type="button"
          key={course.id}
          className="course-card"
          onClick={() => navigate({ page: 'courses', courseId: course.id })}
        >
          <strong>{course.name}</strong>
          {course.code && <span className="muted">{course.code}</span>}
          <span className="muted">
            {course.activityCount} actividades · {course.studentCount}{' '}
            estudiantes
          </span>
        </button>
      ))}
    </div>
  );
}

function Loading({ state }: { state: { status: string } }) {
  if (state.status === 'loading') {
    return (
      <div className="admin-loading">
        <div className="loader" />
        <span>Cargando tu inicio…</span>
      </div>
    );
  }

  return (
    <div className="admin-error-state">
      <strong>No pudimos cargar tu inicio.</strong>
      <span>Recarga la página para intentarlo de nuevo.</span>
    </div>
  );
}

export function StudentHomePage({
  institutionId,
  institutionName,
  navigate,
}: HomeProps) {
  const state = useDashboard<StudentDashboard>(institutionId, 'STUDENT');

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">ESTUDIANTE</p>
          <h1>Inicio</h1>
          <p>Tus materias y entregas en {institutionName}.</p>
        </div>
      </section>

      {state.status !== 'ready' ? (
        <Loading state={state} />
      ) : (
        <>
          {state.preferences.notifyDeadlines &&
            state.dashboard.overdue.length > 0 && (
              <div className="notice-banner warning" role="status">
                Tienes {state.dashboard.overdue.length}{' '}
                {state.dashboard.overdue.length === 1
                  ? 'actividad vencida sin entregar'
                  : 'actividades vencidas sin entregar'}
                .
              </div>
            )}

          <section className="admin-summary-grid">
            <article className="summary-card">
              <div>
                <span className="summary-label">Materias</span>
                <strong>{state.dashboard.courses.length}</strong>
              </div>
            </article>
            <article className="summary-card">
              <div>
                <span className="summary-label">Por entregar</span>
                <strong>{state.dashboard.upcoming.length}</strong>
              </div>
            </article>
            <article className="summary-card">
              <div>
                <span className="summary-label">Vencidas</span>
                <strong>{state.dashboard.overdue.length}</strong>
              </div>
            </article>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">MATERIAS</p>
                <h2>Mis cursos</h2>
              </div>
              <button
                type="button"
                className="secondary-action"
                onClick={() => navigate({ page: 'courses' })}
              >
                Unirme con código
              </button>
            </div>
            {state.dashboard.courses.length === 0 ? (
              <p className="field-hint">
                Aún no estás inscrito en cursos. Pide a tu profesor el
                código del curso y úsalo en «Cursos».
              </p>
            ) : (
              <CourseCards
                courses={state.dashboard.courses}
                navigate={navigate}
              />
            )}
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">PENDIENTES</p>
                <h2>Próximas entregas</h2>
              </div>
            </div>
            <ActivityList
              items={state.dashboard.upcoming}
              navigate={navigate}
              empty="No tienes entregas pendientes."
            />
            {state.dashboard.overdue.length > 0 && (
              <>
                <h3 className="sub-heading">Vencidas</h3>
                <ActivityList
                  items={state.dashboard.overdue}
                  navigate={navigate}
                  empty=""
                />
              </>
            )}
          </section>

          {state.preferences.notifyFeedback && (
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <p className="page-kicker">NOVEDADES</p>
                  <h2>Retroalimentación reciente</h2>
                </div>
              </div>
              <ActivityList
                items={state.dashboard.recentFeedback}
                navigate={navigate}
                empty="Aún no hay entregas revisadas."
                extra={item => {
                  const reviewed = state.dashboard.recentFeedback.find(
                    x => x.activityId === item.activityId,
                  );
                  return reviewed?.score !== null && reviewed?.score !== undefined
                    ? `Nota ${reviewed.score}${reviewed.maxScore ? ` / ${reviewed.maxScore}` : ''}`
                    : 'Con comentarios';
                }}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function TeacherHomePage({
  institutionId,
  institutionName,
  navigate,
}: HomeProps) {
  const state = useDashboard<TeacherDashboard>(institutionId, 'TEACHER');

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">PROFESOR</p>
          <h1>Inicio</h1>
          <p>Tus cursos y trabajos por revisar en {institutionName}.</p>
        </div>
      </section>

      {state.status !== 'ready' ? (
        <Loading state={state} />
      ) : (
        <>
          <section className="admin-summary-grid">
            <article className="summary-card">
              <div>
                <span className="summary-label">Cursos activos</span>
                <strong>{state.dashboard.courses.length}</strong>
              </div>
            </article>
            <article className="summary-card">
              <div>
                <span className="summary-label">Estudiantes</span>
                <strong>
                  {state.dashboard.courses.reduce(
                    (sum, course) => sum + course.studentCount,
                    0,
                  )}
                </strong>
              </div>
            </article>
            <article className="summary-card">
              <div>
                <span className="summary-label">Por revisar</span>
                <strong>
                  {state.dashboard.toReview.reduce(
                    (sum, item) => sum + item.pending,
                    0,
                  )}
                </strong>
              </div>
            </article>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">CURSOS</p>
                <h2>Mis cursos</h2>
              </div>
              <button
                type="button"
                className="primary-action"
                onClick={() => navigate({ page: 'courses' })}
              >
                Crear curso
              </button>
            </div>
            {state.dashboard.courses.length === 0 ? (
              <p className="field-hint">
                Todavía no tienes cursos activos.
              </p>
            ) : (
              <CourseCards
                courses={state.dashboard.courses}
                navigate={navigate}
              />
            )}
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">REVISIÓN</p>
                <h2>Trabajos por revisar</h2>
              </div>
            </div>
            <ActivityList
              items={state.dashboard.toReview}
              navigate={navigate}
              empty="No hay entregas pendientes de revisión."
              extra={item => {
                const row = state.dashboard.toReview.find(
                  x => x.activityId === item.activityId,
                );
                return row ? `${row.pending} sin revisar` : null;
              }}
            />
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">SEGUIMIENTO</p>
                <h2>Próximos vencimientos y faltantes</h2>
              </div>
            </div>
            <ActivityList
              items={state.dashboard.upcoming}
              navigate={navigate}
              empty="No hay vencimientos próximos."
            />
            {state.dashboard.missingAfterDue.length > 0 && (
              <>
                <h3 className="sub-heading">
                  Vencidas con entregas faltantes
                </h3>
                <ActivityList
                  items={state.dashboard.missingAfterDue}
                  navigate={navigate}
                  empty=""
                  extra={item => {
                    const row = state.dashboard.missingAfterDue.find(
                      x => x.activityId === item.activityId,
                    );
                    return row ? `${row.missing} sin entregar` : null;
                  }}
                />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
