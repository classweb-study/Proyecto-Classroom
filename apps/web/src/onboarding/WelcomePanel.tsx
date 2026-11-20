import { useId } from 'react';

import { CloseIcon, PaletteIcon, SearchIcon, UserIcon } from '../components/icons';
import { Button, IconButton } from '../components/ui';
import { dismissWelcome, useWelcomeDismissed } from './welcome-store';

/*
 * Bienvenida para la primera visita: tres cosas que no son obvias de la
 * interfaz. Sale en Inicio hasta que la persona la cierra; se puede
 * volver a mostrar desde Mi perfil.
 */
export function WelcomePanel({
  firstName,
  onOpenAppearance,
}: {
  firstName: string;
  onOpenAppearance: () => void;
}) {
  const dismissed = useWelcomeDismissed();
  const titleId = useId();

  if (dismissed) return null;

  return (
    <section className="welcome-panel" aria-labelledby={titleId}>
      <div className="welcome-panel-header">
        <div>
          <p className="ui-kicker">Primera vez aquí</p>
          <h2 id={titleId}>Hola, {firstName}. Tres cosas para empezar</h2>
        </div>
        <IconButton label="Cerrar bienvenida" icon={<CloseIcon />} size="sm" onClick={dismissWelcome} />
      </div>

      <ul className="welcome-tips">
        <li>
          <span className="welcome-tip-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <span>
            <strong>Busca cualquier sección</strong>
            Presiona <kbd>/</kbd> en cualquier momento y escribe, por ejemplo, «solicitudes».
          </span>
        </li>
        <li>
          <span className="welcome-tip-icon" aria-hidden="true">
            <PaletteIcon />
          </span>
          <span>
            <strong>Elige tus colores</strong>
            Base blanca, negra o gris y el color secundario que prefieras.
          </span>
        </li>
        <li>
          <span className="welcome-tip-icon" aria-hidden="true">
            <UserIcon />
          </span>
          <span>
            <strong>Tu cuenta está en el avatar</strong>
            Arriba a la derecha: tu perfil, la apariencia y cerrar sesión.
          </span>
        </li>
      </ul>

      <div className="welcome-actions">
        <Button variant="primary" size="sm" onClick={dismissWelcome}>
          Entendido
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenAppearance}>
          Ir a Apariencia
        </Button>
      </div>
    </section>
  );
}
