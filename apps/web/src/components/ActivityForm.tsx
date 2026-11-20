import { useState, type FormEvent } from 'react';

import {
  errorMessage,
  toLocalInput,
  type Activity,
  type ActivityKind,
  type ActivityStatus,
} from '../lib/api';

export type ActivityPayload = {
  title: string;
  instructions: string;
  rubric: string;
  kind: ActivityKind;
  templateRepoUrl: string;
  resourceUrl: string;
  maxScore: number | null;
  dueAt: string | null;
  allowLate: boolean;
  status: ActivityStatus;
};

type ActivityFormProps = {
  initial?: Activity;
  submitLabel: string;
  onSubmit: (activity: ActivityPayload) => Promise<void>;
  onCancel: () => void;
};

export function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: ActivityFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [instructions, setInstructions] = useState(
    initial?.instructions ?? '',
  );
  const [rubric, setRubric] = useState(initial?.rubric ?? '');
  const [kind, setKind] = useState<ActivityKind>(
    initial?.kind ?? 'REPOSITORY',
  );
  const [templateRepoUrl, setTemplateRepoUrl] = useState(
    initial?.templateRepoUrl ?? '',
  );
  const [resourceUrl, setResourceUrl] = useState(
    initial?.resourceUrl ?? '',
  );
  const [maxScore, setMaxScore] = useState(
    initial?.maxScore ? String(initial.maxScore) : '',
  );
  const [dueAt, setDueAt] = useState(toLocalInput(initial?.dueAt ?? null));
  const [allowLate, setAllowLate] = useState(initial?.allowLate ?? true);
  const [status, setStatus] = useState<ActivityStatus>(
    initial?.status ?? 'DRAFT',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await onSubmit({
        title,
        instructions,
        rubric,
        kind,
        templateRepoUrl,
        resourceUrl,
        maxScore: maxScore ? Number(maxScore) : null,
        // datetime-local is local time; the API stores an absolute instant.
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        allowLate,
        status,
      });
    } catch (submitError) {
      setError(
        errorMessage(submitError, 'No pudimos guardar la actividad.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-form activity-form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="activity-title">Título</label>
        <input
          id="activity-title"
          required
          minLength={2}
          maxLength={160}
          value={title}
          onChange={event => setTitle(event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="activity-instructions">Instrucciones</label>
        <textarea
          id="activity-instructions"
          required
          rows={5}
          maxLength={10000}
          value={instructions}
          onChange={event => setInstructions(event.target.value)}
        />
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="activity-kind">Tipo de entrega</label>
          <select
            id="activity-kind"
            value={kind}
            onChange={event => setKind(event.target.value as ActivityKind)}
          >
            <option value="REPOSITORY">Repositorio de GitHub</option>
            <option value="LINK">Enlace</option>
            <option value="TEXT">Texto</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="activity-due">Fecha de entrega (opcional)</label>
          <input
            id="activity-due"
            type="datetime-local"
            value={dueAt}
            onChange={event => setDueAt(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="activity-max">Nota máxima (opcional)</label>
          <input
            id="activity-max"
            type="number"
            min={1}
            max={1000}
            step={1}
            value={maxScore}
            onChange={event => setMaxScore(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="activity-status">Estado</label>
          <select
            id="activity-status"
            value={status}
            onChange={event =>
              setStatus(event.target.value as ActivityStatus)
            }
          >
            <option value="DRAFT">Borrador (solo profesores)</option>
            <option value="PUBLISHED">Publicada</option>
            <option value="ARCHIVED">Archivada</option>
          </select>
        </div>
      </div>

      {kind === 'REPOSITORY' && (
        <div className="form-field">
          <label htmlFor="activity-template">
            Repositorio plantilla (opcional)
          </label>
          <input
            id="activity-template"
            type="url"
            placeholder="https://github.com/organizacion/plantilla"
            maxLength={500}
            value={templateRepoUrl}
            onChange={event => setTemplateRepoUrl(event.target.value)}
          />
          <span className="field-hint">
            Con una plantilla de GitHub autorizada, cada estudiante puede aceptar la tarea para crear su copia privada.
          </span>
        </div>
      )}

      <div className="form-field">
        <label htmlFor="activity-resource">Recurso de apoyo (opcional)</label>
        <input
          id="activity-resource"
          type="url"
          placeholder="https://…"
          maxLength={500}
          value={resourceUrl}
          onChange={event => setResourceUrl(event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="activity-rubric">Rúbrica (opcional)</label>
        <textarea
          id="activity-rubric"
          rows={4}
          maxLength={5000}
          placeholder="Ej.: Funcionalidad 50% · Código limpio 30% · Documentación 20%"
          value={rubric}
          onChange={event => setRubric(event.target.value)}
        />
      </div>

      <label className="inline-check">
        <input
          type="checkbox"
          checked={allowLate}
          onChange={event => setAllowLate(event.target.checked)}
        />
        Aceptar entregas después de la fecha (se marcan como tardías)
      </label>

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
          {busy ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
