import {
  forwardRef,
  useId,
  useState,
  type KeyboardEvent,
} from 'react';

import {
  GROUP_LABELS,
  searchSections,
  type AdminPage,
  type Section,
} from '../navigation/sections';
import { SearchIcon } from './icons';

/*
 * Buscador de secciones (combobox de WAI-ARIA): escribir filtra,
 * ↑/↓ recorren los resultados, Enter abre la sección y Escape limpia.
 * Solo busca secciones de la app; buscar usuarios o cursos necesita
 * endpoints que todavía no existen.
 */
export const SectionSearch = forwardRef<
  HTMLInputElement,
  {
    sections: Section[];
    onNavigate: (page: AdminPage) => void;
  }
>(function SectionSearch({ sections, onNavigate }, inputRef) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);

  const results = searchSections(query, sections);
  const expanded = open && query.trim().length > 0;

  function go(section: Section) {
    onNavigate(section.id);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && expanded && results[activeIndex]) {
      event.preventDefault();
      go(results[activeIndex]);
    } else if (event.key === 'Escape') {
      if (query) event.stopPropagation();
      setQuery('');
      setOpen(false);
    }
  }

  return (
    <div className="section-search">
      <label className="visually-hidden" htmlFor={`${listId}-input`}>
        Buscar sección
      </label>
      <span className="section-search-icon">
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        className="section-search-input"
        type="search"
        placeholder="Buscar sección"
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && results[activeIndex] ? `${listId}-${results[activeIndex].id}` : undefined
        }
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
      <kbd className="section-search-hint" aria-hidden="true">
        /
      </kbd>

      <ul id={listId} role="listbox" aria-label="Secciones encontradas" className="section-search-results" hidden={!expanded}>
        {results.map((section, index) => (
          <li
            key={section.id}
            id={`${listId}-${section.id}`}
            role="option"
            aria-selected={index === activeIndex}
            className={index === activeIndex ? 'is-active' : undefined}
            // mousedown en vez de click: el input pierde el foco antes del click.
            onMouseDown={event => {
              event.preventDefault();
              go(section);
            }}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <span>{section.label}</span>
            <small>{GROUP_LABELS[section.group]}</small>
          </li>
        ))}
        {expanded && results.length === 0 && (
          <li className="section-search-empty" role="presentation">
            No hay secciones con “{query.trim()}”.
          </li>
        )}
      </ul>

      <span className="visually-hidden" role="status" aria-live="polite">
        {expanded
          ? results.length === 1
            ? '1 sección encontrada'
            : `${results.length} secciones encontradas`
          : ''}
      </span>
    </div>
  );
});
