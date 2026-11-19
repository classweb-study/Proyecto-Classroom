import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from './logic';

export type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  kicker?: string;
  title?: ReactNode;
  /* Botones o contadores a la derecha del título. */
  actions?: ReactNode;
  /* Nivel del título: h2 en paneles de página, h3 dentro de otra tarjeta. */
  headingLevel?: 2 | 3;
  padding?: 'md' | 'lg';
  as?: 'section' | 'article' | 'div';
};

/* Tarjeta o panel. Con `title` se vuelve una región con nombre. */
export function Card({
  kicker,
  title,
  actions,
  headingLevel = 2,
  padding = 'lg',
  as: Element = 'section',
  className,
  children,
  ...props
}: CardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasHeader = kicker || title || actions;

  return (
    <Element className={cx('ui-card', `ui-card--${padding}`, className)} {...props}>
      {hasHeader && (
        <header className="ui-card-header">
          <div>
            {kicker && <p className="ui-kicker">{kicker}</p>}
            {title && <Heading className="ui-card-title">{title}</Heading>}
          </div>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </Element>
  );
}
