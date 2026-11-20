import { emailKind } from '../session/session-state';
import { Alert } from './ui';

/*
 * Aviso para el formulario de solicitud de acceso (pantalla de Maura).
 * Se pone debajo del campo de correo:
 *
 *   <EmailKindNotice email={email} institutionName="Universidad X"
 *                    institutionDomains={['unix.edu.co']} />
 *
 * Solo informa. Pedir acceso con Gmail está permitido y el correo nunca
 * da acceso por sí solo: lo decide el administrador.
 */
export function EmailKindNotice({
  email,
  institutionName,
  institutionDomains = [],
}: {
  email: string;
  institutionName: string;
  institutionDomains?: readonly string[];
}) {
  const kind = emailKind(email, institutionDomains);

  if (kind === 'personal') {
    return (
      <Alert tone="info" title="Este correo no es de la institución">
        Puedes enviar la solicitud igual. Como el administrador de {institutionName} no puede comprobar
        con este correo que perteneces a la institución, la revisión puede tardar más o pedirte otro
        dato, como tu código universitario.
      </Alert>
    );
  }

  if (kind === 'institutional') {
    return (
      <Alert tone="success" title={`Correo de ${institutionName}`}>
        Ayuda al administrador a revisar tu solicitud. Igual la decisión es suya.
      </Alert>
    );
  }

  return null;
}
