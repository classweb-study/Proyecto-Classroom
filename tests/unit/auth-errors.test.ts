import { describe, expect, it } from 'vitest';

import { readAuthError, withoutAuthError } from '../../apps/web/src/session/auth-errors.js';

describe('readAuthError', () => {
  it('traduce los códigos que hoy devuelve el callback de GitHub', () => {
    expect(readAuthError('?auth_error=GITHUB_AUTHORIZATION_FAILED')?.title).toBe(
      'No se completó el permiso en GitHub',
    );
    expect(readAuthError('?auth_error=OAUTH_CALLBACK_INVALID')?.title).toBe('El inicio de sesión venció');
    expect(readAuthError('?auth_error=GITHUB_AUTHENTICATION_FAILED')?.title).toBe('GitHub no respondió');
    expect(readAuthError('?auth_error=INSTITUTION_UNAVAILABLE')?.title).toBe(
      'La institución no está disponible',
    );
  });

  it('un código desconocido muestra un mensaje genérico', () => {
    expect(readAuthError('?auth_error=ALGO_NUEVO')?.title).toBe('No pudimos iniciar tu sesión');
  });

  it('nunca muestra texto libre de la URL', () => {
    expect(readAuthError('?auth_error=<script>alert(1)</script>')).toBeNull();
    expect(readAuthError('?auth_error=hola mundo')).toBeNull();
    expect(readAuthError('')).toBeNull();
    expect(readAuthError('?otra=1')).toBeNull();
  });
});

describe('withoutAuthError', () => {
  it('quita solo auth_error y conserva lo demás', () => {
    expect(withoutAuthError('?auth_error=X')).toBe('');
    expect(withoutAuthError('?auth_error=X&a=1')).toBe('?a=1');
    expect(withoutAuthError('?a=1')).toBe('?a=1');
  });
});
