import type { ReactNode } from 'react';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { cx } from './logic';
import { Spinner } from './Spinner';

export type TableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  align?: 'start' | 'end';
  /* Ancho CSS opcional: '120px', '30%'. */
  width?: string;
};

export type TableState =
  | { status: 'loading'; label?: string }
  | { status: 'error'; message: string; onRetry?: () => void }
  | { status: 'ready' };

/*
 * Tabla con estados de carga, vacío y error incluidos, para que ninguna
 * pantalla se quede en blanco. En pantallas de menos de 760 px cada fila
 * se vuelve una tarjeta y cada celda muestra su encabezado (data-label).
 */
export function Table<Row>({
  caption,
  hideCaption = false,
  columns,
  rows,
  rowKey,
  state = { status: 'ready' },
  empty,
}: {
  /* Describe la tabla para lectores de pantalla: "Solicitudes pendientes". */
  caption: string;
  hideCaption?: boolean;
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  state?: TableState;
  empty: { title: string; description?: ReactNode; icon?: ReactNode };
}) {
  if (state.status === 'loading') {
    return (
      <div className="ui-table-state">
        <Spinner size="lg" label={state.label ?? 'Cargando…'} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="ui-table-state ui-table-state--error" role="alert">
        <strong>No pudimos cargar esta información.</strong>
        <span>{state.message}</span>
        {state.onRetry && (
          <Button variant="secondary" size="sm" onClick={state.onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState icon={empty.icon} title={empty.title}>
        {empty.description}
      </EmptyState>
    );
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <caption className={cx(hideCaption && 'visually-hidden')}>{caption}</caption>
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cx(column.align === 'end' && 'align-end')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={cx(column.align === 'end' && 'align-end')}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
