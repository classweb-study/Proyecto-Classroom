import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cx, nextTabIndex } from './logic';

export type TabItem = {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
  /* Contador opcional, por ejemplo solicitudes pendientes. */
  count?: number;
};

/*
 * Pestañas con el patrón de WAI-ARIA: Tab entra a la pestaña activa,
 * las flechas, Inicio y Fin se mueven entre pestañas (activación
 * automática) y Tab de nuevo pasa al contenido.
 * Puede ser controlado (`value` + `onChange`) o no.
 */
export function Tabs({
  items,
  label,
  value,
  defaultValue,
  onChange,
}: {
  items: TabItem[];
  /* Nombre del grupo para lectores de pantalla. */
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
}) {
  const baseId = useId();
  const firstEnabled = items.find(item => !item.disabled)?.id ?? items[0]?.id;
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const selected = value ?? internal;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(id: string) {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(
      event.key,
      index,
      items.map(item => Boolean(item.disabled)),
    );
    if (next === null) return;

    event.preventDefault();
    select(items[next]!.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="ui-tabs">
      <div role="tablist" aria-label={label} className="ui-tablist">
        {items.map((item, index) => {
          const isSelected = item.id === selected;
          return (
            <button
              key={item.id}
              ref={element => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              className={cx('ui-tab', isSelected && 'is-selected')}
              onClick={() => select(item.id)}
              onKeyDown={event => onKeyDown(event, index)}
            >
              {item.label}
              {item.count !== undefined && <span className="ui-tab-count">{item.count}</span>}
            </button>
          );
        })}
      </div>

      {items.map(item => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selected}
          tabIndex={0}
          className="ui-tabpanel"
        >
          {item.id === selected && item.content}
        </div>
      ))}
    </div>
  );
}
