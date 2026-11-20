/*
 * Mensajes para los errores del inicio de sesión con GitHub.
 *
 * Hoy (19 nov 2026) la API responde estos errores con un JSON 400/502/503
 * en /auth/github/callback y la persona ve ese JSON en el navegador.
 * Si la API redirige a `/?auth_error=CODIGO`, la pantalla de login
 * muestra el mensaje de aquí. Es un cambio de Jero; el frontend ya está
 * listo para recibirlo.
 */

export type AuthErrorCode =
  | 'GITHUB_AUTHORIZATION_FAILED'
  | 'OAUTH_CALLBACK_INVALID'
  | 'GITHUB_AUTHENTICATION_FAILED'
  | 'INSTITUTION_UNAVAILABLE';

export type AuthErrorMessage = { title: string; body: string };

const MESSAGES: Record<AuthErrorCode, AuthErrorMessage> = {
  GITHUB_AUTHORIZATION_FAILED: {
    title: 'No se completó el permiso en GitHub',
    body: 'Puede que hayas cancelado la autorización. Si quieres entrar, vuelve a intentarlo y acepta en GitHub.',
  },
  OAUTH_CALLBACK_INVALID: {
    title: 'El inicio de sesión venció',
    body: 'Pasó mucho tiempo o se abrió en otra pestaña. Vuelve a empezar desde aquí.',
  },
  GITHUB_AUTHENTICATION_FAILED: {
    title: 'GitHub no respondió',
    body: 'No pudimos confirmar tu cuenta con GitHub. Inténtalo de nuevo en unos minutos.',
  },
  INSTITUTION_UNAVAILABLE: {
    title: 'La institución no está disponible',
    body: 'El enlace de acceso apunta a una institución que no existe o no está activa. Pide el enlace correcto a tu universidad.',
  },
};

const GENERIC: AuthErrorMessage = {
  title: 'No pudimos iniciar tu sesión',
  body: 'Algo falló al entrar con GitHub. Inténtalo de nuevo.',
};

/*
 * Lee ?auth_error= de la URL. Solo acepta códigos conocidos o un texto
 * corto de letras y guiones: nunca se muestra texto libre de la URL.
 */
export function readAuthError(search: string): AuthErrorMessage | null {
  const code = new URLSearchParams(search).get('auth_error');
  if (!code) return null;
  if (code in MESSAGES) return MESSAGES[code as AuthErrorCode];
  return /^[A-Z_]{1,64}$/.test(code) ? GENERIC : null;
}

/* La URL sin ?auth_error=, para que recargar no repita el mensaje. */
export function withoutAuthError(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('auth_error');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
