import { useEffect, useId, useRef, useState } from 'react';

import { ChevronDownIcon, LogoutIcon, PaletteIcon, UserIcon } from './icons';

/*
 * Menú de perfil de la barra superior. Es un botón que despliega un
 * panel (patrón "disclosure"): Escape o un clic afuera lo cierran y el
 * foco vuelve al botón.
 */
export function ProfileMenu({
  githubLogin,
  avatarUrl,
  roleLabel,
  institutionName,
  loggingOut,
  onOpenProfile,
  onOpenAppearance,
  onLogout,
}: {
  githubLogin: string;
  avatarUrl: string | null;
  roleLabel: string;
  institutionName: string;
  loggingOut: boolean;
  onOpenProfile: () => void;
  onOpenAppearance: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    firstItemRef.current?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = githubLogin.charAt(0).toUpperCase();

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="profile-menu-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="profile-avatar" />
        ) : (
          <span className="profile-avatar" aria-hidden="true">
            {initial}
          </span>
        )}
        <span className="profile-menu-copy">
          <strong title={githubLogin}>{githubLogin}</strong>
          <span>{roleLabel}</span>
        </span>
        <ChevronDownIcon className="profile-menu-chevron" />
        <span className="visually-hidden">: menú de la cuenta</span>
      </button>

      <div id={panelId} className="profile-menu-panel" hidden={!open}>
        <div className="profile-menu-header">
          <strong>@{githubLogin}</strong>
          <span>
            {roleLabel} · {institutionName}
          </span>
          <span className="profile-menu-github">Sesión iniciada con GitHub</span>
        </div>

        <button
          ref={firstItemRef}
          type="button"
          className="profile-menu-item"
          onClick={() => {
            setOpen(false);
            onOpenProfile();
          }}
        >
          <UserIcon />
          Mi perfil
        </button>

        <button
          type="button"
          className="profile-menu-item"
          onClick={() => {
            setOpen(false);
            onOpenAppearance();
          }}
        >
          <PaletteIcon />
          Apariencia
        </button>

        <button
          type="button"
          className="profile-menu-item danger"
          onClick={onLogout}
          disabled={loggingOut}
          aria-busy={loggingOut || undefined}
        >
          <LogoutIcon />
          {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  );
}
