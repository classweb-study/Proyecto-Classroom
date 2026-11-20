/*
 * Pruebas de render de los componentes del frontend.
 *
 * Se renderiza a HTML con react-dom/server (ya instalado), sin jsdom ni
 * Testing Library, para no agregar dependencias a package.json. Eso
 * alcanza para revisar texto, roles, atributos ARIA y estados; lo que
 * pasa al hacer clic se prueba en la revisión visual con navegador
 * (apps/web/scripts/visual-check.mjs).
 *
 * Los .tsx se importan con una ruta en variable para que el typecheck de
 * la raíz (que no compila JSX) no los siga; Vitest sí los transforma con
 * la configuración de apps/web/tsconfig.json.
 */
import { describe, expect, it } from 'vitest';

type AnyComponent = (props: Record<string, unknown>) => unknown;
type Module = Record<string, AnyComponent>;

const { createElement } = (await import('react')) as unknown as {
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
};
const { renderToStaticMarkup } = (await import('react-dom/server')) as unknown as {
  renderToStaticMarkup: (element: unknown) => string;
};

async function load(relative: string): Promise<Module> {
  const path = `../../apps/web/src/${relative}`;
  return (await import(/* @vite-ignore */ path)) as Module;
}

function render(component: AnyComponent | undefined, props: Record<string, unknown> = {}, ...children: unknown[]) {
  if (!component) throw new Error('Componente no encontrado');
  return renderToStaticMarkup(createElement(component, props, ...children));
}

/* Atributo de la primera etiqueta que coincide con el selector simple `tag`. */
function attr(html: string, tag: string, name: string): string | null {
  const element = new RegExp(`<${tag}\\b[^>]*>`).exec(html)?.[0];
  if (!element) return null;
  return new RegExp(`\\s${name}="([^"]*)"`).exec(element)?.[1] ?? null;
}

const ui = await load('components/ui/index.ts');
const noop = () => undefined;

describe('Button', () => {
  it('es type="button" por defecto para no enviar formularios sin querer', () => {
    expect(attr(render(ui.Button, {}, 'Guardar'), 'button', 'type')).toBe('button');
  });

  it('en carga queda deshabilitado, avisa con aria-busy y muestra el texto en gerundio', () => {
    const html = render(ui.Button, { loading: true, loadingText: 'Aprobando…' }, 'Aprobar');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Aprobando…');
    expect(html).not.toContain('>Aprobar<');
  });

  it('IconButton exige una etiqueta para lectores de pantalla', () => {
    const html = render(ui.IconButton, { label: 'Cerrar aviso', icon: 'x' });
    expect(attr(html, 'button', 'aria-label')).toBe('Cerrar aviso');
  });
});

describe('Input y Select', () => {
  it('une etiqueta, ayuda y error con el campo', () => {
    const html = render(ui.Input, { label: 'Correo', id: 'correo', hint: 'Puede ser Gmail', error: 'Falta la @' });
    expect(attr(html, 'label', 'for')).toBe('correo');
    expect(attr(html, 'input', 'id')).toBe('correo');
    expect(attr(html, 'input', 'aria-describedby')).toBe('correo-hint correo-error');
    expect(attr(html, 'input', 'aria-invalid')).toBe('true');
    expect(html).toContain('id="correo-error"');
  });

  it('es obligatorio salvo que se marque opcional, y entonces lo dice', () => {
    expect(render(ui.Input, { label: 'Nombre' })).toContain('required=""');
    const optional = render(ui.Input, { label: 'Código', optional: true });
    expect(optional).not.toContain('required=""');
    expect(optional).toContain('(opcional)');
  });

  it('Select muestra la opción vacía de ayuda', () => {
    const html = render(ui.Select, {
      label: 'Institución',
      placeholder: 'Elige una institución',
      options: [{ value: 'a', label: 'Universidad A' }],
    });
    expect(html).toContain('<option value="" disabled="">Elige una institución</option>');
    expect(html).toContain('Universidad A');
  });
});

describe('Badge, Alert y EmptyState', () => {
  it('StatusBadge traduce el estado de la API y no se rompe con uno nuevo', () => {
    expect(render(ui.StatusBadge, { status: 'PENDING' })).toContain('Pendiente');
    expect(render(ui.StatusBadge, { status: 'PENDING' })).toContain('ui-badge--warning');
    const unknown = render(ui.StatusBadge, { status: 'CANCELLED' });
    expect(unknown).toContain('CANCELLED');
    expect(unknown).toContain('ui-badge--neutral');
  });

  it('solo el aviso de peligro interrumpe al lector de pantalla', () => {
    expect(render(ui.Alert, { tone: 'danger', title: 'Error' })).toContain('role="alert"');
    expect(render(ui.Alert, { tone: 'info', title: 'Dato' })).not.toContain('role="alert"');
  });

  it('EmptyState dice por qué no hay datos', () => {
    const html = render(ui.EmptyState, { title: 'No hay solicitudes' }, 'Cuando alguien pida acceso aparecerá aquí.');
    expect(html).toContain('No hay solicitudes');
    expect(html).toContain('Cuando alguien pida acceso');
  });
});

describe('Table', () => {
  const base = {
    caption: 'Solicitudes',
    columns: [
      { key: 'user', header: 'Usuario', render: (row: { login: string }) => row.login },
      { key: 'actions', header: 'Acciones', align: 'end', render: () => 'x' },
    ],
    rowKey: (row: { login: string }) => row.login,
    empty: { title: 'No hay solicitudes pendientes' },
  };

  it('tiene caption, encabezados con scope y etiqueta por celda para móvil', () => {
    const html = render(ui.Table, { ...base, rows: [{ login: '@ana' }] });
    expect(html).toContain('<caption');
    expect(html).toContain('scope="col"');
    expect(html).toContain('data-label="Usuario"');
    expect(html).toContain('@ana');
  });

  it('muestra carga, error con reintento y vacío', () => {
    expect(render(ui.Table, { ...base, rows: [], state: { status: 'loading' } })).toContain('role="status"');
    const error = render(ui.Table, { ...base, rows: [], state: { status: 'error', message: 'Caído', onRetry: noop } });
    expect(error).toContain('role="alert"');
    expect(error).toContain('Reintentar');
    expect(render(ui.Table, { ...base, rows: [] })).toContain('No hay solicitudes pendientes');
  });
});

describe('Tabs', () => {
  const html = render(ui.Tabs, {
    label: 'Por estado',
    items: [
      { id: 'a', label: 'Pendientes', content: 'contenido A' },
      { id: 'b', label: 'Aprobadas', content: 'contenido B' },
      { id: 'c', label: 'Archivadas', content: 'contenido C', disabled: true },
    ],
  });

  it('marca la pestaña activa y deja solo ella en el orden de Tab', () => {
    expect(html).toContain('role="tablist" aria-label="Por estado"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/gi)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('contenido A');
    expect(html).not.toContain('contenido B');
  });
});

describe('Pantallas de estado', async () => {
  const screens = await load('pages/status/StatusScreens.tsx');
  const request = {
    id: 'r1',
    institution: { id: 'i1', name: 'Universidad X', slug: 'x' },
    status: 'PENDING',
    assignedRole: null,
  };

  it('sin conexión usa el título exacto que comprueba el E2E de Jero', () => {
    const html = render(screens.ServerErrorScreen, { kind: 'network', retrying: false, onRetry: noop });
    expect(html).toContain('<h1');
    expect(html).toContain('No pudimos cargar tu sesión.');
  });

  it('el error del servidor muestra el código para reportarlo', () => {
    const html = render(screens.ServerErrorScreen, { kind: 'server', code: 503, retrying: false, onRetry: noop });
    expect(html).toContain('WebClass tiene un problema en este momento');
    expect(html).toContain('503');
  });

  it('pendiente: institución, botón para revisar y aviso si el correo es personal', () => {
    const plain = render(screens.PendingAccessScreen, { request, login: 'ana', checking: false, onCheckAgain: noop, onLogout: noop, loggingOut: false });
    expect(plain).toContain('Universidad X');
    expect(plain).toContain('Revisar de nuevo');
    expect(plain).not.toContain('Usaste un correo personal');

    const gmail = render(screens.PendingAccessScreen, { request: { ...request, contactEmail: 'ana@gmail.com' }, login: 'ana', checking: false, onCheckAgain: noop, onLogout: noop, loggingOut: false });
    expect(gmail).toContain('Usaste un correo personal');
  });

  it('rechazada: lee el motivo con el nombre que usa la rama de Maura (decisionReason)', () => {
    const html = render(screens.DeniedAccessScreen, {
      request: { ...request, status: 'DENIED', decisionReason: 'No apareces en la lista.' },
      login: 'ana',
      onLogout: noop,
      loggingOut: false,
    });
    expect(html).toContain('No apareces en la lista.');
    const without = render(screens.DeniedAccessScreen, { request: { ...request, status: 'DENIED' }, login: 'ana', onLogout: noop, loggingOut: false });
    expect(without).toContain('La institución no indicó un motivo.');
  });

  it('sesión terminada lleva a entrar de nuevo con GitHub', () => {
    expect(attr(render(screens.SessionExpiredScreen), 'a', 'href')).toBe('/auth/github');
  });
});

describe('EmailKindNotice', async () => {
  const { EmailKindNotice } = await load('components/EmailKindNotice.tsx');
  const props = { institutionName: 'Universidad X', institutionDomains: ['x.edu.co'] };

  it('avisa si el correo es personal, confirma si es de la institución y calla si no sabe', () => {
    expect(render(EmailKindNotice, { ...props, email: 'ana@gmail.com' })).toContain('no es de la institución');
    expect(render(EmailKindNotice, { ...props, email: 'ana@est.x.edu.co' })).toContain('Correo de Universidad X');
    expect(render(EmailKindNotice, { ...props, email: 'ana' })).toBe('');
  });
});

describe('AppShell', async () => {
  const { AppShell } = await load('components/AppShell.tsx');
  const props = {
    activePage: 'users',
    onNavigate: noop,
    githubLogin: 'ana',
    avatarUrl: null,
    institutionName: 'Universidad X',
    roles: ['ADMIN'],
    loggingOut: false,
    onLogout: noop,
  };

  it('tiene enlace para saltar al contenido, menú con nombre y página actual marcada', () => {
    const html = render(AppShell, props, 'contenido');
    expect(html).toContain('href="#contenido-principal"');
    expect(html).toContain('aria-label="Menú principal"');
    expect(html).toMatch(/aria-current="page"[^>]*>.*?Solicitudes/s);
    expect(html).toContain('id="contenido-principal"');
  });

  it('acepta las props del selector de institución que envía main.tsx en la rama de Maura', () => {
    const html = render(AppShell, {
      ...props,
      institutions: [
        { id: 'i1', name: 'Universidad X' },
        { id: 'i2', name: 'Instituto Y' },
      ],
      activeInstitutionId: 'i2',
      onSwitchInstitution: noop,
    });
    expect(html).toContain('class="institution-select"');
    expect(html).toContain('<option value="i2" selected="">Instituto Y</option>');
  });

  it('con una sola institución muestra solo el nombre', () => {
    expect(render(AppShell, props)).not.toContain('institution-select');
  });

  it('cada rol ve su menú: profesor y estudiante ven Cursos, no la administración', () => {
    const teacher = render(AppShell, { ...props, activePage: 'courses', roles: ['TEACHER'], viewRole: 'TEACHER' });
    expect(teacher).toContain('Cursos');
    expect(teacher).toContain('Docencia');
    expect(teacher).not.toContain('Profesores');
    const admin = render(AppShell, props);
    expect(admin).not.toContain('>Cursos<');
    expect(admin).toContain('Mis solicitudes');
  });

  it('Plataforma solo aparece para quien administra la plataforma', () => {
    expect(render(AppShell, props)).not.toContain('Administración general');
    expect(render(AppShell, { ...props, isPlatformAdmin: true })).toContain('Administración general');
  });

  it('con varios roles muestra "Ver como", y usa el logo y color de la institución', () => {
    const html = render(AppShell, {
      ...props,
      roles: ['ADMIN', 'STUDENT'],
      viewRole: 'ADMIN',
      onSwitchRole: noop,
      institutionLogoUrl: '/logo.png',
      institutionAccent: '#7c3aed',
    });
    expect(html).toContain('aria-label="Ver como"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('src="/logo.png"');
    expect(html).toContain('--vmat-institution-accent:#7c3aed');
  });
});

describe('ProfilePage (versión de Maura)', async () => {
  const { ProfilePage } = await load('pages/ProfilePage.tsx');
  const html = render(ProfilePage, {
    githubLogin: 'ana-dev',
    avatarUrl: null,
    institutions: [{ id: 'i1', name: 'Universidad X', roles: ['TEACHER'] }],
    onOpenRequests: noop,
  });

  it('se monta con las props que le pasa main.tsx y muestra la cuenta', () => {
    expect(html).toContain('ana-dev');
    expect(html).toContain('A');
  });
});
