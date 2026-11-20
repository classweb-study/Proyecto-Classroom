/*
 * Aviso de sesión vencida para cualquier pantalla.
 *
 * Si una pantalla recibe 401 de la API mientras la persona estaba dentro,
 * llama a reportSessionExpired() (o usa apiFetch, que lo hace solo) y la
 * app muestra "Tu sesión terminó" en vez de un error genérico.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportSessionExpired() {
  listeners.forEach(listener => listener());
}

/*
 * fetch con la cookie de sesión que avisa si la sesión venció.
 * Uso sugerido para las pantallas nuevas:
 *   const response = await apiFetch(`/admin/institutions/${id}/members`);
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { credentials: 'same-origin', ...init });
  if (response.status === 401) reportSessionExpired();
  return response;
}
