# Guía de estilos de WebClass

Esta guía describe el sistema visual del frontend (`apps/web`). Los valores viven en [`src/styles/tokens.css`](src/styles/tokens.css) y esta página explica cuándo usar cada uno. Si algo de la interfaz no encaja en lo que está aquí, se discute con el equipo y se agrega a la guía antes de inventar un estilo nuevo en una pantalla.

Responsable: Juandi. Pantallas académicas que la usan: Maura.

## Reglas básicas

1. Los componentes usan tokens **semánticos** (`--color-text-muted`, `--accent-solid`, `--danger-bg`…). No se escriben colores hex dentro de las clases y no se usa la escala `--neutral-*` directamente, porque esa escala no cambia con el tema.
2. La apariencia se controla con dos atributos en `<html>`: `data-theme` para el color base (`light`, `dark`, `gray`) y `data-accent` para el color secundario. Los aplica `src/theme/appearance-store.ts`; ningún componente los escribe a mano. Ninguna regla de componente se repite por tema: si un color tiene que cambiar con la base, se crea o ajusta un token.
3. El secundario lo elige cada persona, así que nada puede depender de que sea verde: en el código se dice `accent`, no `green`.
4. Todo par de texto y fondo que se use debe pasar WCAG 2.2 AA. La prueba `tests/unit/design-tokens.test.ts` lo verifica en los dos temas; si agregas un par nuevo, agrégalo también a la prueba.
5. No se muestran botones ni enlaces de funciones que todavía no existen. Si una sección no tiene datos, se usa un estado vacío honesto.

## Color

### Colores base

Hay tres bases. Cada una define los mismos tokens de superficie, texto, borde y estado.

| Base | `data-theme` | Fondo | Superficie | Carácter |
|---|---|---|---|---|
| Blanco (predeterminada) | `light` | `#f6f7f8` | `#ffffff` | Clara, gris con un toque verde |
| Negro | `dark` | `#101512` | `#181f1b` | Oscura, casi negra con matiz verde |
| Gris | `gray` | `#25282b` | `#2f3337` | Oscura atenuada, gris neutro sin matiz |

Si la persona no ha elegido nada, se usa Negro cuando su sistema operativo está en modo oscuro y Blanco en cualquier otro caso.

### Superficies y texto

Valores de las bases Blanco y Negro (los de Gris están en `tokens.css`).

| Token | Uso | Blanco | Negro |
|---|---|---|---|
| `--color-bg` | Fondo de la página | `#f6f7f8` | `#101512` |
| `--color-surface` | Tarjetas, paneles, barra superior | `#ffffff` | `#181f1b` |
| `--color-surface-raised` | Menús desplegables, modales | `#ffffff` | `#1d2520` |
| `--color-surface-sunken` | Filas alternas, zonas de entrada de datos | `#fbfcfb` | `#141a17` |
| `--color-overlay` | Fondo detrás de un modal | negro 48 % | negro 60 % |
| `--color-text` | Texto general | `#202723` | `#edf3ef` |
| `--color-text-strong` | Títulos y cifras destacadas | `#101512` | `#f7faf8` |
| `--color-text-muted` | Descripciones, texto secundario | `#5f6b64` | `#a8b2ac` |
| `--color-text-subtle` | Metadatos (fechas, contadores). Solo sobre `surface` | `#6b7670` | `#8c9790` |
| `--color-text-disabled` | Controles deshabilitados. No usar para texto que haya que leer | `#8c9790` | `#66716b` |
| `--color-border` | Bordes de tarjetas, inputs y tablas | `#e2e6e3` | `#2c3831` |
| `--color-border-subtle` | Separadores internos | `#edf0ee` | `#263029` |
| `--color-border-strong` | Borde de input en hover | `#cfd6d1` | `#3a4740` |
| `--color-hover` | Fondo de ítems del menú y botones neutros en hover | `#f1f4f2` | `#1f2823` |
| `--color-topbar` | Barra superior (semitransparente, con desenfoque) | blanco 94 % | `#181f1b` 94 % |
| `--inverse-bg` / `--inverse-text` | Superficie invertida: botón "Continuar con GitHub" | `#151918` / blanco | `#edf3ef` / `#101512` |

### Color secundario (acento)

| Token | Uso | Verde sobre Blanco | Verde sobre Negro |
|---|---|---|---|
| `--accent-solid` | Botón principal, ítem activo del menú, enlaces destacados | `#117a46` | `#21b66c` |
| `--accent-solid-hover` | Hover del botón principal | `#0d6a3c` | `#29c978` |
| `--accent-on-solid` | Texto e iconos encima de `accent-solid` | `#ffffff` | `#0b130f` |
| `--accent-soft` | Fondo de ítem activo, chips seleccionados | `#eaf7ef` | `#173326` |
| `--accent-soft-hover` | Hover sobre `accent-soft` | `#dcf1e4` | `#1d3f2f` |
| `--accent-text` | Texto de acento sobre `surface` o `accent-soft` | `#116b3f` | `#7cdfa6` |
| `--accent-border` | Borde de elementos seleccionados | `#b6dfc6` | `#2b5a40` |

En las bases oscuras el botón principal lleva texto casi negro. Con texto blanco, el verde claro del modo oscuro solo llega a 2,6:1.

Hay siete secundarios. Cada uno define los siete tokens de la tabla dos veces: una para la base Blanco y otra compartida por Negro y Gris.

| Secundario | `data-accent` | Botón sobre Blanco | Botón sobre Negro/Gris | Bases permitidas |
|---|---|---|---|---|
| Verde (predeterminado) | `green` | `#117a46` | `#21b66c` | Las tres |
| Azul | `blue` | `#1d5fc2` | `#5b9bf0` | Las tres |
| Morado | `purple` | `#6b3fc4` | `#a684f0` | Las tres |
| Rosa | `pink` | `#c02670` | `#f06aa8` | Las tres |
| Rojo | `red` | `#c0362c` | `#f0736a` | Las tres |
| Negro | `black` | `#1c2420` | — | Solo Blanco |
| Blanco | `white` | — | `#eef2f0` | Solo Negro y Gris |

Combinaciones bloqueadas: secundario blanco sobre base Blanco, y secundario negro sobre las bases Negro o Gris. Con ellas el botón principal y el ítem activo del menú se pierden contra el fondo. La lista vive en `src/theme/appearance.ts` (`isAccentAllowed`). Si alguien llega a una combinación bloqueada, por ejemplo cambiando de base con el botón rápido, el secundario pasa a su opuesto (negro ↔ blanco) en vez de quedar invisible.

El botón "Denegar" usa sus propios tokens (`--deny-bg`, `--deny-bg-hover`, `--deny-text`, `--deny-border`). Normalmente es destructivo suave: fondo de superficie, borde y texto rojos. Con el secundario rojo pasa a rojo sólido con letras blancas en las tres bases (`#b42d24` sobre blanco, `#c4362c` sobre negro y gris; los dos superan 5:1 con blanco), por decisión del equipo. Como en ese caso queda parecido al botón principal, las acciones destructivas nunca dependen solo del color: siempre llevan un texto explícito y, cuando borran algo, piden confirmación.

Para agregar un secundario nuevo: añadir el nombre a `ACCENTS` y `ACCENT_LABELS` en `appearance.ts`, escribir sus dos bloques en `tokens.css` y correr `npm test`. La prueba revisa el contraste de cada combinación permitida.

### Estados

Cada estado trae `-bg`, `-text` y `-border`. Peligro trae además `-solid` y `-on-solid` para el botón de acción destructiva.

| Estado | Cuándo | Ejemplos en WebClass |
|---|---|---|
| `success` | Algo quedó hecho o está activo | Solicitud aprobada, identidad verificada, membresía activa |
| `warning` | Espera una acción o una decisión | Solicitud pendiente, identidad pendiente, entrega tardía |
| `danger` | Rechazo, error o acción destructiva | Solicitud denegada, error del servidor, revocar rol |
| `info` | Aviso neutro o informativo | Sesión por expirar, cambios sin guardar, ayuda contextual |

Equivalencia con los estados que ya devuelve la API:

| Valor de la API | Estado visual | Texto sugerido |
|---|---|---|
| `PENDING` | `warning` | Pendiente |
| `APPROVED`, `VERIFIED`, `ACTIVE` | `success` | Aprobada / Verificada / Activa |
| `DENIED`, `REJECTED` | `danger` | Denegada / Rechazada |
| `null` (sin dato) | neutro (`--color-text-muted` sobre `--color-surface-sunken`) | Sin identidad académica |

El color nunca es la única señal: el badge siempre lleva el texto del estado.

### Contraste verificado

Con verde. La prueba revisa también los otros seis secundarios en cada base permitida.

| Par | Blanco | Negro |
|---|---|---|
| Texto sobre fondo | 14,2:1 | 16,4:1 |
| Texto secundario sobre superficie | 5,6:1 | 7,7:1 |
| Metadatos sobre superficie | 4,7:1 | 5,6:1 |
| Texto sobre botón principal | 5,4:1 | 7,2:1 |
| Texto de acento sobre `accent-soft` | 6,0:1 | 8,4:1 |
| Aviso de advertencia | 5,2:1 | 8,2:1 |
| Aviso de peligro | 5,7:1 | 7,9:1 |
| Texto sobre botón destructivo | 5,7:1 | 6,0:1 |
| Aviso informativo | 5,7:1 | 8,0:1 |

Cambios respecto a los colores que había antes de esta guía:

- El gris secundario `#7f8983` pasó a `#5f6b64`. El anterior daba 3,6:1 sobre blanco y no alcanzaba AA.
- El gris de metadatos `#969f9a` pasó a `#6b7670`. El anterior daba 2,7:1.
- El verde del botón `#169c5a` pasó a `#117a46`. Con texto blanco, el anterior daba 3,5:1.
- El texto de advertencia `#85681e` pasó a `#7a6018`, para no quedar justo en el límite.

## Tipografía

Fuente: `--font-sans` (Inter si está instalada; si no, la del sistema). Para código, logins de GitHub, SHAs y URLs de repositorio se usa `--font-mono`.

| Token | Tamaño | Uso |
|---|---|---|
| `--text-display` | 32–44 px fluido | Título del login y de pantallas de bienvenida |
| `--text-2xl` | 28 px | `h1` de cada página |
| `--text-xl` | 22 px | `h2` de sección o de panel |
| `--text-lg` | 18 px | Título de tarjeta, cifras de resumen |
| `--text-base` | 16 px | Texto general, inputs |
| `--text-sm` | 14 px | Tablas, botones, ayudas de formulario |
| `--text-xs` | 12 px | Kickers en mayúscula, badges, metadatos |

Antes había 25 tamaños distintos, algunos de menos de 10 px (`0.61rem`). Ningún texto baja de 12 px.

Pesos: `--weight-regular` (400) para el cuerpo, `--weight-semibold` (600) para botones y etiquetas, `--weight-bold` (700) para títulos y `--weight-heavy` (800) solo para kickers en mayúscula y el logotipo.

Interlineado: `--leading-tight` en títulos, `--leading-snug` en tarjetas y tablas, `--leading-normal` en párrafos.

Kicker (la etiqueta pequeña en mayúscula sobre los títulos, como "ADMINISTRACIÓN"): `--text-xs`, `--weight-heavy`, `--tracking-caps`, color `--color-text-muted`. El texto se escribe normal en el código y se pone en mayúscula con CSS (`text-transform: uppercase`), para que los lectores de pantalla no lo deletreen.

## Espaciado

Base de 4 px. Se usan solo los pasos de la escala:

| Token | px | Uso típico |
|---|---|---|
| `--space-1` | 4 | Entre icono y texto pequeño |
| `--space-2` | 8 | Entre icono y texto de botón, entre badges |
| `--space-3` | 12 | Relleno interno de chips, separación en listas densas |
| `--space-4` | 16 | Relleno de inputs y filas de tabla, separación entre campos |
| `--space-5` | 20 | Relleno de tarjetas pequeñas |
| `--space-6` | 24 | Relleno de paneles, separación entre tarjetas |
| `--space-8` | 32 | Separación entre secciones de una página |
| `--space-10` | 40 | Relleno del contenido principal en escritorio |
| `--space-12` | 48 | Relleno de la tarjeta de login |
| `--space-16` | 64 | Márgenes de pantallas vacías grandes |

Alturas de control: `--control-sm` 32 px (botones dentro de tablas), `--control-md` 40 px (lo normal), `--control-lg` 48 px (botón de login y acciones principales en móvil). En pantallas táctiles nada clicable mide menos de 40 px de alto.

## Bordes, radios y sombras

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 6 px | Badges, chips |
| `--radius-md` | 10 px | Botones, inputs, selects, ítems del menú |
| `--radius-lg` | 14 px | Tarjetas, paneles, tablas |
| `--radius-xl` | 24 px | Tarjeta de login, modales grandes |
| `--radius-full` | 999 px | Píldoras de estado, avatares |

Los bordes son de `--border-width` (1 px) con `--color-border`. Sombras: `--shadow-sm` para tarjetas en reposo, `--shadow-md` para menús y tarjetas en hover, `--shadow-lg` solo para modales y la tarjeta de login. En modo oscuro las tarjetas se separan del fondo más por el borde que por la sombra.

## Iconos

- SVG en línea con `viewBox="0 0 24 24"`, trazo de 1,8 px, `stroke="currentColor"`, extremos y uniones redondeados. Así heredan el color del texto y cambian solos con el tema.
- Tamaño: 18 px dentro de botones y del menú, 20 px en tarjetas de resumen, 24 px en estados vacíos.
- Si el icono acompaña un texto, lleva `aria-hidden="true"`. Si va solo (botón de tema, cerrar modal), el botón lleva `aria-label`.
- Todos los iconos están en `src/components/icons.tsx` y aceptan `size`. No se dibujan SVG nuevos dentro de las pantallas: si falta uno, se agrega a ese archivo.

## Componentes

Estas son las reglas visuales. Ya están implementadas en `src/components/ui/` (ver "Componentes en React", más abajo), así que en las pantallas nuevas se usan los componentes y no se repiten estas reglas a mano.

### Botones

| Variante | Aspecto | Cuándo |
|---|---|---|
| `primary` | Fondo `accent-solid`, texto `accent-on-solid` | La acción principal de la vista. Máximo uno por sección |
| `secondary` | Fondo `surface`, borde `color-border`, texto `color-text` | Acciones alternativas (Cancelar, Ver detalle) |
| `ghost` | Sin fondo ni borde, texto `color-text-muted` | Acciones de bajo peso dentro de tablas o barras |
| `danger` | Fondo `danger-solid`, texto `danger-on-solid` | Acciones destructivas confirmadas (revocar, eliminar) |
| `danger-soft` | Fondo `danger-bg`, texto `danger-text`, borde `danger-border` | La opción destructiva cuando aparece junto a otras (Denegar) |

Estados de todo botón: hover (color `-hover` o fondo un paso más oscuro), foco (`--focus-ring`), deshabilitado (opacidad 0,55 y `cursor: not-allowed`), cargando (texto con gerundio, por ejemplo "Aprobando…", con `aria-busy="true"` y el ancho fijo para que no salte). Tamaños `sm`, `md` y `lg` según las alturas de control.

### Formularios

- Cada campo tiene una etiqueta visible encima (`--text-sm`, `--weight-semibold`). El placeholder no reemplaza la etiqueta.
- El texto de ayuda va debajo, en `--text-sm` y `--color-text-muted`, enlazado con `aria-describedby`.
- Error: borde `danger-text`, mensaje debajo en `danger-text` que diga qué hacer ("Escribe un correo con @"), y `aria-invalid="true"`. Se valida al salir del campo o al enviar, no en cada tecla.
- Los campos opcionales se marcan "(opcional)". Los obligatorios no llevan asterisco.
- Inputs de `--control-md` de alto, relleno horizontal `--space-3`, radio `--radius-md`, fondo `surface`, borde `color-border` y `border-strong` en hover.
- Los botones del formulario van al final, con el primario a la derecha en escritorio y a todo el ancho en móvil.

### Tablas y listas

- Encabezado en `--text-xs` con kicker y fondo `surface-sunken`; filas de `--text-sm` con separador `border-subtle`.
- Las acciones de la fila van en la última columna, alineadas a la derecha, con botones `sm`.
- Por debajo de 760 px la tabla se convierte en tarjetas apiladas (es lo que ya hacen las listas de solicitudes y miembros).
- Siempre con estado de carga, vacío y error. El estado vacío explica por qué no hay datos y qué va a pasar ("Cuando alguien solicite acceso aparecerá aquí").

### Avisos y toasts

- **Aviso en página** (`Alert`): bloque con fondo `-bg`, borde `-border`, texto `-text` e icono del estado. Se usa para mensajes que dependen de la vista (solicitud pendiente, sin institución).
- **Toast**: confirmación breve de una acción ("Solicitud aprobada"). Esquina inferior derecha en escritorio y abajo a todo el ancho en móvil, `--z-toast`, desaparece a los 5 segundos salvo si es un error. Se anuncia con `role="status"` (o `role="alert"` si es un error).
- Los errores nunca muestran detalles técnicos ni texto para desarrolladores. Se dice qué pasó y qué puede hacer la persona.

### Badges

Píldora de `--radius-full`, `--text-xs`, `--weight-semibold`, relleno `--space-1` × `--space-3`, con los colores del estado. Para roles (Administrador, Profesor, Estudiante) se usa el estilo neutro con un punto de color al inicio.

### Tarjetas y paneles

Fondo `surface`, borde `color-border`, `--radius-lg`, relleno `--space-6` y `--shadow-sm`. El encabezado del panel lleva kicker y `h2`, y las acciones del panel van a la derecha.

## Componentes en React

Se importan todos desde un solo lugar:

```tsx
import { Button, Card, Input, StatusBadge, Table, useToast } from '../components/ui';
```

Con `npm run dev:web` aparece en el menú la entrada **Componentes (dev)**, con un ejemplo de cada uno. Esa página no existe en el build de producción.

| Componente | Para qué | Notas |
|---|---|---|
| `Button` | Cualquier acción | `variant`: `primary`, `secondary`, `ghost`, `danger`, `danger-soft`. `size`: `sm`, `md`, `lg`. `loading` + `loadingText="Aprobando…"` bloquea el botón y avisa al lector. Es `type="button"` por defecto; para enviar un formulario hay que poner `type="submit"` |
| `IconButton` | Botón con solo un icono | `label` es obligatorio: es lo que lee el lector de pantalla |
| `Input`, `Select`, `Textarea` | Campos de formulario | `label` obligatorio, `hint`, `error`, `optional`. Unen solos la etiqueta, la ayuda y el error con `aria-describedby` y marcan `aria-invalid`. Sin `optional`, el campo es obligatorio |
| `FormSection`, `FormActions` | Estructura del formulario | Grilla de dos columnas (una en móvil). Los textarea ocupan todo el ancho. En móvil los botones quedan a todo el ancho y el principal arriba |
| `Card` | Paneles y tarjetas | `kicker`, `title`, `actions`. Con `headingLevel={3}` dentro de otra tarjeta |
| `Badge`, `StatusBadge` | Estados y roles | `StatusBadge status="PENDING"` aplica el color y el texto de la tabla de estados. Un estado nuevo de la API sale neutro con su nombre tal cual, hasta que se agregue a `logic.ts` |
| `Alert` | Aviso dentro de la página | `tone`: `info`, `success`, `warning`, `danger`. El de `danger` se anuncia de inmediato |
| `Table` | Listas de registros | Recibe `columns`, `rows`, `rowKey` y `state` (`loading`, `error` con `onRetry`, `ready`). El estado vacío es obligatorio (`empty`). En móvil cada fila pasa a ser una tarjeta |
| `Tabs` | Vistas dentro de una página | Flechas, Inicio y Fin para moverse; se saltan las deshabilitadas. `count` muestra un contador |
| `Modal` | Confirmaciones y formularios cortos | Usa `<dialog>` nativo: mantiene el foco dentro, cierra con Escape y devuelve el foco al botón que la abrió. `closeOnBackdrop={false}` para formularios a medio llenar |
| `useToast` | Confirmar una acción terminada | `toast({ tone: 'success', title: 'Solicitud aprobada' })`. Se van solos a los 5 s, salvo los de error. La app ya está envuelta en `ToastProvider` |
| `EmptyState` | Secciones sin datos | Dice por qué no hay datos. Sin botones de funciones que no existen |
| `Spinner` | Carga suelta | Con `label`, el lector de pantalla anuncia qué se está cargando |

La lógica que no depende del navegador (tono de cada estado, teclado de las pestañas, cola de avisos) está en `src/components/ui/logic.ts` y tiene pruebas en `tests/unit/ui-logic.test.ts`.

## Navegación

La estructura vive en `src/components/AppShell.tsx` y la lista de secciones en `src/navigation/sections.ts`. Para agregar una sección nueva se suma una entrada a `SECTIONS` (nombre, grupo, ruta prevista y palabras clave para el buscador) y su icono en `AppShell`. El menú, el buscador, los breadcrumbs y el título de la pestaña salen solos de esa lista.

- **Menú lateral:** agrupado en "Administración" y "Ajustes". Por debajo de 760 px se esconde y se abre con el botón ☰ como un panel desde la izquierda, con fondo oscuro detrás. Al abrirse, el foco entra al panel; Escape, el fondo o elegir una sección lo cierran y el foco vuelve al botón. Mientras está abierto, la página de atrás no se desplaza.
- **Buscador de secciones:** arriba del menú. Encuentra por nombre o palabra clave, sin importar tildes ni mayúsculas ("tema" lleva a Apariencia). Se abre con la tecla `/` desde cualquier parte; ↑/↓ y Enter para elegir, Escape para limpiar. Solo busca secciones: buscar usuarios o cursos necesita endpoints que todavía no existen.
- **Breadcrumbs:** Institución › Grupo › Sección. La institución lleva a Inicio. En móvil solo se ve la sección actual.
- **Menú de perfil:** el avatar de la barra superior abre un panel con la cuenta, el rol, la institución, Apariencia y "Cerrar sesión". Escape o un clic afuera lo cierran.
- **Saltar al contenido:** el primer Tab de la página muestra ese enlace, que lleva directo al contenido.
- **Al cambiar de sección** cambia el título de la pestaña ("Usuarios · WebClass"), el foco pasa al contenido (así el lector de pantalla anuncia la página nueva) y la vista vuelve arriba.
- **Direcciones:** por ahora cambiar de sección no cambia la URL. Cada sección ya tiene su ruta prevista (`path` en `sections.ts`) para cuando exista la regla de rutas en `vercel.json`, que es de Jero.
- **Secciones sin funciones todavía** (por ejemplo Institución): `EmptyState` que dice que no está disponible y qué va a haber ahí. Sin botones de mentira.

## Pantallas de estado

Están en `src/pages/status/StatusScreens.tsx` y `main.tsx` elige cuál mostrar con `accessViewFor` (`src/session/session-state.ts`), con el mismo orden de reglas que antes. Todas siguen la misma forma: icono del estado, título que dice qué pasó, explicación corta, qué puede hacer la persona y con qué cuenta entró.

| Pantalla | Cuándo | Qué ofrece |
|---|---|---|
| Solicitud en revisión | Sin institución y con solicitud pendiente | "Revisar de nuevo" y cerrar sesión. Si la solicitud trae un correo personal, un aviso explica que la revisión puede pedir otro dato |
| No se aprobó tu acceso | Sin institución y con solicitud rechazada | El motivo, si la API lo manda; si no, lo dice. Pasos: pedir acceso a la institución correcta o hablar con la administración |
| Sin institución | Sin institución ni solicitud | Explica que una institución tiene que darle acceso |
| Tu espacio todavía no está listo | Profesor o estudiante (su interfaz aún no existe) | Confirma que el acceso quedó guardado |
| Tu sesión terminó | `/me` responde 401 cuando la persona ya estaba dentro | Volver a entrar con GitHub |
| Error del servidor / sin conexión | `/me` responde 5xx o no hay red | Reintentar. Con error del servidor muestra el código para reportarlo |

Al volver a la pestaña (si pasó más de un minuto desde la última revisión) la app vuelve a pedir `/me`: así detecta una sesión vencida y, si una solicitud pendiente ya fue aprobada, la persona entra sola.

Para que una pantalla nueva avise que la sesión venció, en vez de mostrar un error genérico, se usa `apiFetch` de `src/session/session-events.ts` en lugar de `fetch`. Si la respuesta es 401, la app cambia sola a "Tu sesión terminó".

Para el formulario de solicitud de acceso hay un aviso listo, `EmailKindNotice` (`src/components/EmailKindNotice.tsx`). Dice si el correo es de la institución o personal. Solo informa: pedir acceso con Gmail está permitido, y el correo nunca da acceso por sí solo.

## Login, bienvenida y perfil

- **Login:** si la URL trae `?auth_error=CODIGO`, se muestra un aviso con un texto para personas (`src/session/auth-errors.ts`) y el parámetro se borra de la URL. Nunca se muestra texto libre de la URL. Al hacer clic en "Continuar con GitHub" aparece "Abriendo GitHub…" para que nadie haga doble clic.
- **Bienvenida:** la primera vez, Inicio muestra tres consejos (buscador con `/`, Apariencia y el menú del avatar). Se cierra con "Entendido" o la X y se recuerda en este navegador (`vmat-welcome-dismissed`). Se puede volver a mostrar desde Mi perfil.
- **Mi perfil** (Ajustes → Mi perfil, o desde el avatar): cuenta de GitHub, instituciones con rol e identidad académica, apariencia y cerrar sesión. Se pueden editar el nombre para mostrar, el correo de contacto y los avisos de entregas y retroalimentación. Los roles y el código los cambia la administración, y la foto y el usuario se cambian en GitHub.

## Compatibilidad con ramas anteriores a los tokens

`src/styles/compat.css` define las variables viejas `--vmat-*` a partir de los tokens. Existe para que las ramas que salieron de `main` antes de la tarea 3 (las de Maura) se vean bien después del merge y sigan la base y el secundario de cada persona. No se escriben estilos nuevos con esos nombres. Cuando todo el CSS use tokens, el archivo se borra. `tests/unit/compat-styles.test.ts` comprueba que estén todas las variables que usan esas ramas.

## Foco y accesibilidad

- Todo elemento interactivo muestra `--focus-ring` con `:focus-visible`. No se quita el `outline` sin poner este anillo.
- El ítem activo del menú lleva `aria-current="page"`.
- `prefers-reduced-motion: reduce` deja en 0 las duraciones de `--duration-*`. Las animaciones deben usar esos tokens para que la preferencia funcione.
- El orden de tabulación sigue el orden visual.
- **Alto contraste de Windows (`forced-colors`):** el navegador quita fondos y sombras, así que el anillo de foco y los estados activos (menú, pestañas, opciones de Apariencia) tienen además un contorno con colores del sistema (`Highlight`). Si un estado nuevo se marca solo con fondo o sombra, hay que agregarlo al bloque `@media (forced-colors: active)` de `style.css`.
- **Textos largos:** nombres de institución o usuarios largos se cortan con "…" y llevan el texto completo en `title`. La página actual en los breadcrumbs nunca se corta.
- **Reflujo:** todo funciona sin desborde horizontal desde 320 px de ancho (equivale a zoom al 400 % en una pantalla de 1280 px).

## Pruebas del frontend

| Qué | Dónde | Cómo se corre |
|---|---|---|
| Lógica sin navegador (tokens, contraste, navegación, sesión, errores de login) | `tests/unit/*.test.ts` | `npm test` |
| Render de componentes y pantallas (texto, roles, ARIA, estados) | `tests/unit/components-render.test.ts` | `npm test` |
| Contratos con el trabajo de otros: título que espera el E2E de Jero y props del selector de institución de Maura | `tests/unit/components-render.test.ts` | `npm test` |
| Recorrido visual con navegador: 10 escenarios (estudiante, profesor y administrador con sus secciones) × 3 anchos × 3 combinaciones de color, teclado, desborde, consola y, si está instalado, axe-core | `apps/web/scripts/visual-check.mjs` | `npm run dev:web` y en otra terminal `node apps/web/scripts/visual-check.mjs` |

Las pruebas de render usan `react-dom/server`, que ya está instalado, para no agregar `jsdom` ni Testing Library a `package.json`.

## Movimiento

`--duration-fast` (120 ms) para hover y foco, `--duration-base` (200 ms) para abrir menús y cambiar de pestaña, `--duration-slow` (320 ms) para modales y toasts. Curva `--ease-standard`. Nada se anima solo por adorno.

## Capas

`--z-sticky` (barra superior), `--z-dropdown` (menús), `--z-overlay` (fondo del modal), `--z-modal`, `--z-toast`. No se usan números sueltos de `z-index`.

## Puntos de quiebre

CSS no permite variables dentro de `@media`, así que estos valores se escriben a mano y deben ser solo estos:

| Nombre | Ancho | Qué cambia |
|---|---|---|
| `sm` | `max-width: 620px` | Formularios y botones a todo el ancho |
| `md` | `max-width: 760px` | El menú lateral se vuelve barra superior; tablas a tarjetas |
| `lg` | `max-width: 1000px` | Grillas de resumen a una columna |

Antes de esta guía el CSS tenía ocho bloques `@media` con siete anchos distintos. Ahora solo existen estos tres.

## Panel de Apariencia

Está en Ajustes → Apariencia (`src/pages/AppearancePage.tsx`). Cada persona elige ahí la base y el secundario. Reglas que sigue y que deben respetar los paneles de ajustes futuros:

- Las opciones son radios nativos ocultos con `.visually-hidden` dentro de un `<label>`. Así funcionan las flechas del teclado y los lectores de pantalla sin código extra. El foco se ve en la tarjeta o el círculo con `:has(input:focus-visible)`.
- Las miniaturas y los círculos se pintan poniendo `data-theme` y `data-accent` en el propio elemento: los tokens funcionan en cualquier nodo, no solo en `<html>`. Siempre se ponen los dos atributos juntos; si falta `data-accent`, el elemento hereda el secundario de la página.
- Un color bloqueado se muestra tachado, con el motivo escrito debajo, y su radio queda `disabled`.
- Cuando el secundario cambia solo al cambiar de base, se avisa con `role="status"`.
- Los cambios se aplican al instante, sin botón de guardar. "Restaurar predeterminados" se deshabilita si ya está en Blanco con Verde.
- El botón de la barra superior sigue disponible como atajo: recorre las tres bases sin tocar el secundario.

## Textos de la interfaz

- Español de Colombia, tuteo ("Revisa", "Solicita acceso").
- Botones con verbos concretos: "Aprobar como profesor" mejor que "Aceptar".
- Fechas con `Intl.DateTimeFormat('es-CO')`.
- Se nombra la institución cuando ayuda ("Tu solicitud para Universidad X está pendiente").
- Sin promesas de funciones que no existen ("Próximamente" solo si el equipo lo acordó).
