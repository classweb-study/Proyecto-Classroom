import { useState, type FormEvent, type ReactNode } from 'react';

import { EmailKindNotice } from '../components/EmailKindNotice';
import {
  CheckIcon,
  InstitutionIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from '../components/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormActions,
  FormSection,
  Input,
  Modal,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Textarea,
  useToast,
  type TableColumn,
  type TableState,
} from '../components/ui';

/*
 * Catálogo de componentes. SOLO se muestra con `npm run dev:web`
 * (import.meta.env.DEV); el build de producción no lo incluye.
 * Todos los datos de esta página son de ejemplo y no llaman a la API.
 */

type ExampleRequest = {
  id: string;
  login: string;
  institution: string;
  role: string;
  status: string;
  date: string;
};

const EXAMPLE_REQUESTS: ExampleRequest[] = [
  { id: '1', login: '@ana-dev', institution: 'Universidad de Ejemplo', role: 'Estudiante', status: 'PENDING', date: '15 nov 2026' },
  { id: '2', login: '@carlos-r', institution: 'Universidad de Ejemplo', role: 'Profesor', status: 'APPROVED', date: '12 nov 2026' },
  { id: '3', login: '@laura-m', institution: 'Universidad de Ejemplo', role: 'Estudiante', status: 'DENIED', date: '10 nov 2026' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card kicker="Componente" title={title}>
      <div className="catalog-stack">{children}</div>
    </Card>
  );
}

export function ComponentCatalogPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [tableState, setTableState] = useState<'ready' | 'loading' | 'error' | 'empty'>('ready');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const columns: TableColumn<ExampleRequest>[] = [
    { key: 'user', header: 'Usuario', render: row => <strong>{row.login}</strong> },
    { key: 'role', header: 'Rol solicitado', render: row => row.role },
    { key: 'status', header: 'Estado', render: row => <StatusBadge status={row.status} /> },
    { key: 'date', header: 'Fecha', render: row => row.date },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      render: row =>
        row.status === 'PENDING' ? (
          <span className="catalog-row-actions">
            <Button size="sm" variant="primary">Aprobar</Button>
            <Button size="sm" variant="danger-soft">Denegar</Button>
          </span>
        ) : (
          <span className="catalog-muted">Sin acciones</span>
        ),
    },
  ];

  const state: TableState =
    tableState === 'loading'
      ? { status: 'loading', label: 'Cargando solicitudes…' }
      : tableState === 'error'
        ? { status: 'error', message: 'El servidor no respondió.', onRetry: () => setTableState('ready') }
        : { status: 'ready' };

  function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!email.includes('@')) {
      setEmailError('Escribe un correo con @, por ejemplo nombre@universidad.edu.co.');
      return;
    }
    setEmailError(null);
    toast({ tone: 'success', title: 'Formulario válido', description: 'Ejemplo: aquí se enviaría la solicitud.' });
  }

  function simulateLoading() {
    setLoadingDemo(true);
    window.setTimeout(() => setLoadingDemo(false), 1500);
  }

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">Solo en desarrollo</p>
          <h1>Catálogo de componentes</h1>
          <p>
            Ejemplos de <code>src/components/ui</code>. Esta página no existe en producción y
            ningún botón llama a la API.
          </p>
        </div>
      </section>

      <Section title="Button">
        <div className="catalog-row">
          <Button variant="primary">Principal</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Revocar rol</Button>
          <Button variant="danger-soft">Denegar</Button>
        </div>
        <div className="catalog-row">
          <Button variant="primary" size="sm">Pequeño</Button>
          <Button variant="primary" size="md">Mediano</Button>
          <Button variant="primary" size="lg" iconStart={<PlusIcon />}>Grande con icono</Button>
          <Button variant="secondary" disabled>Deshabilitado</Button>
          <Button variant="primary" loading={loadingDemo} loadingText="Aprobando…" onClick={simulateLoading}>
            Probar carga
          </Button>
        </div>
      </Section>

      <Section title="Badge y StatusBadge">
        <div className="catalog-row">
          <Badge>Neutro</Badge>
          <Badge tone="accent" dot>Administrador</Badge>
          <Badge tone="info">Información</Badge>
          <StatusBadge status="PENDING" />
          <StatusBadge status="APPROVED" />
          <StatusBadge status="VERIFIED" />
          <StatusBadge status="DENIED" />
          <StatusBadge status={null} label="Sin identidad académica" />
        </div>
      </Section>

      <Section title="Alert">
        <Alert tone="warning" title="Solicitud pendiente">
          Tu solicitud para Universidad de Ejemplo está esperando la revisión de un administrador.
        </Alert>
        <Alert tone="info" title="Correo no institucional">
          Puedes solicitar acceso con Gmail. Un administrador revisará tu solicitud antes de darte acceso.
        </Alert>
        <Alert tone="success" title="Acceso aprobado">Ya puedes entrar a tus cursos.</Alert>
        <Alert
          tone="danger"
          title="Solicitud rechazada"
          actions={<Button size="sm" variant="secondary">Ver motivo</Button>}
        >
          Solicita acceso a tu institución correspondiente.
        </Alert>
      </Section>

      <Section title="Formulario (Input, Select, Textarea)">
        <form onSubmit={submitForm} noValidate>
          <FormSection
            title="Solicitud de acceso"
            description="Ejemplo de cómo se arma un formulario. Maura definirá los campos reales."
          >
            <Input label="Nombre completo" autoComplete="name" />
            <Input
              label="Correo de contacto"
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              hint="Puede ser Gmail u otro correo personal. Prueba con uno @ejemplo.edu.co."
              error={emailError}
            />
            <div className="is-wide">
              <EmailKindNotice
                email={email}
                institutionName="Universidad de Ejemplo"
                institutionDomains={['ejemplo.edu.co']}
              />
            </div>
            <Select
              label="Institución"
              placeholder="Elige una institución"
              defaultValue=""
              options={[
                { value: 'ejemplo', label: 'Universidad de Ejemplo' },
                { value: 'otra', label: 'Otra universidad' },
              ]}
            />
            <Input label="Código universitario" optional inputMode="numeric" />
            <Textarea label="Motivo" optional hint="Cuéntale al administrador por qué pides acceso." />
          </FormSection>
          <FormActions>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="primary" type="submit">Enviar solicitud</Button>
          </FormActions>
        </form>
        <Input label="Buscar" hideLabel placeholder="Buscar usuarios…" iconStart={<SearchIcon />} optional />
      </Section>

      <Section title="Table">
        <div className="catalog-row">
          {(['ready', 'loading', 'error', 'empty'] as const).map(option => (
            <Button
              key={option}
              size="sm"
              variant={tableState === option ? 'primary' : 'secondary'}
              onClick={() => setTableState(option)}
              aria-pressed={tableState === option}
            >
              {{ ready: 'Con datos', loading: 'Cargando', error: 'Error', empty: 'Vacía' }[option]}
            </Button>
          ))}
        </div>
        <Table
          caption="Solicitudes de acceso de ejemplo"
          hideCaption
          columns={columns}
          rows={tableState === 'empty' ? [] : EXAMPLE_REQUESTS}
          rowKey={row => row.id}
          state={state}
          empty={{
            icon: <UsersIcon />,
            title: 'No hay solicitudes pendientes',
            description: 'Cuando alguien solicite acceso a tu institución aparecerá aquí.',
          }}
        />
      </Section>

      <Section title="Tabs">
        <Tabs
          label="Solicitudes por estado"
          items={[
            { id: 'pending', label: 'Pendientes', count: 1, content: <p>Contenido de pendientes.</p> },
            { id: 'approved', label: 'Aprobadas', count: 1, content: <p>Contenido de aprobadas.</p> },
            { id: 'denied', label: 'Denegadas', count: 1, content: <p>Contenido de denegadas.</p> },
            { id: 'archived', label: 'Archivadas', disabled: true, content: null },
          ]}
        />
      </Section>

      <Section title="Modal y Toast">
        <div className="catalog-row">
          <Button variant="danger" onClick={() => setModalOpen(true)}>Revocar rol…</Button>
          <Button onClick={() => toast({ tone: 'success', title: 'Solicitud aprobada', description: '@ana-dev ahora es estudiante.' })}>
            Aviso de éxito
          </Button>
          <Button onClick={() => toast({ tone: 'info', title: 'Sesión por expirar', description: 'Guarda tus cambios.' })}>
            Aviso informativo
          </Button>
          <Button onClick={() => toast({ tone: 'danger', title: 'No pudimos aprobar la solicitud', description: 'Inténtalo de nuevo en unos minutos.' })}>
            Aviso de error
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="¿Revocar el rol de profesor?"
          description="@carlos-r dejará de ver los cursos de Universidad de Ejemplo. Puedes volver a asignarlo después."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setModalOpen(false);
                  toast({ tone: 'success', title: 'Ejemplo: rol revocado' });
                }}
              >
                Revocar rol
              </Button>
            </>
          }
        />
      </Section>

      <Section title="EmptyState">
        <EmptyState icon={<InstitutionIcon />} title="Aún no perteneces a una institución">
          Solicita acceso a tu universidad. Un administrador revisará tu solicitud.
        </EmptyState>
      </Section>

      <Card kicker="Iconos" title="components/icons.tsx">
        <p className="catalog-muted">
          Todos los iconos salen de un solo archivo y heredan el color del texto. Ejemplo:{' '}
          <CheckIcon size={16} />
        </p>
      </Card>
    </div>
  );
}
