# Plataforma de aula

Base ejecutable local: frontend React, API Fastify, worker inactivo, PostgreSQL y límite interno de GitHub. No contiene funciones académicas, migraciones, trabajos de cola ni llamadas a GitHub.

## Requisitos e instalación

Node **24.21.0** y npm **11.19.0**. Las dependencias directas están fijadas y npm exige engines y peers compatibles.

```sh
npm ci
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

En esta máquina, seleccione el runtime verificado antes de los comandos anteriores:

```powershell
$env:PATH = (Resolve-Path .local/runtimes/node-v24.21.0-win-x64).Path + [IO.Path]::PathSeparator + $env:PATH
node --version
npm --version
```

Deben mostrar `v24.21.0` y `11.19.0`. `.local` y su caché npm no se versionan; en otro equipo instale esas versiones.

## Ejecutar

En terminales separadas:

```sh
npm run dev:api
npm run dev:web
npm run dev:worker
```

Abra http://127.0.0.1:5173. La API escucha únicamente en loopback, puerto 3001 por defecto. `PORT` acepta enteros 1–65535; el proxy de desarrollo apunta al puerto 3001. `GET /health/live` solo declara que el proceso responde; no representa disponibilidad de PostgreSQL, cola o GitHub. El worker acepta únicamente `WORKER_MODE=idle` y `--smoke` para salir inmediatamente. Ctrl+C detiene cada proceso. Tras `npm run build`, use `npm run start:api` y `npm run start:worker -- --smoke` para probar Node ESM emitido.

## Despliegue en Vercel y Neon

`vercel.json` publica Vite y Fastify como servicios del mismo dominio. Antes de hacer un despliegue, en Vercel seleccione el framework **Services**, confirme que el Root Directory es la raíz del repositorio y que la rama de producción es la esperada. El proyecto requiere Node 24.x, según `package.json`.

Configure estas variables como secretos, sin comillas ni espacios añadidos, en Production y también en Preview/Development si se usan esos entornos: `DATABASE_URL`, `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, `AUTH_GITHUB_CALLBACK_URL`, `FRONTEND_ORIGIN` y `NODE_ENV=production`. Vercel provee `VERCEL_ENV`; no se configura manualmente. La URL de Neon debe ser una URL PostgreSQL TLS vigente, con el usuario limitado al mínimo necesario. Nunca copie valores secretos en logs, issues o capturas.

Registre en GitHub OAuth exactamente `AUTH_GITHUB_CALLBACK_URL`; en producción debe ser `https://<dominio>/auth/github/callback`. `FRONTEND_ORIGIN` debe ser el origen HTTPS exacto (`https://<dominio>`, sin ruta). Las cookies de sesión se marcan `Secure`, `HttpOnly` y `SameSite=Lax` en producción; los POST sensibles validan el origen.

Después de cada Preview y de producción, compruebe desde el dominio publicado `GET /health/live` (proceso) y `GET /health/ready` (PostgreSQL). El primero debe responder 200 aun si Neon cae; el segundo debe responder 503 sin revelar detalles cuando falta configuración o la base no responde. `GET /me` sin cookie debe responder 401 controlado, nunca 500. Complete el smoke test OAuth, persistencia y logout únicamente con una cuenta de prueba autorizada. Si falla, use el rollback instantáneo de Vercel al deployment sano anterior; las migraciones se aplican de manera separada con respaldo confirmado, nunca desde una prueba de salud.

### Diagnóstico de deployments protegidos

Los Preview Deployments de Vercel pueden estar protegidos por Vercel Authentication. Un `302` con destino a `vercel.com/sso-api` significa que la protección interceptó la solicitud **antes** de que Fastify se ejecute; no es un error de la API y no generará logs de runtime. Valide esos previews con `vercel curl <url>/health/live` desde una sesión autorizada o desde el navegador de un integrante autorizado. Para probar con `curl` en una máquina con proxy configurado, use `curl --noproxy "*" -i <url>/health/live` para evitar diagnosticar erróneamente el proxy local como un fallo del deployment.

Antes de promover un Preview, verifique en Vercel que el artefacto incluya `services/api/index`, confirme `200` en `/health/live`, confirme el resultado esperado de `/health/ready` y revise Runtime Logs. Los timeouts en el dominio de producción deben investigarse sobre el deployment de `main`; no se deben atribuir a un Preview protegido ni promover una rama hasta contar con una respuesta reproducible.

## PostgreSQL local

Neon CLI escribe las variables de su branch en `.env.local`; los scripts de API, worker y base de datos las cargan automáticamente. La aplicación mantiene `pg` y Drizzle, que son apropiados para este backend Fastify de Node con una conexión `DATABASE_URL` pooled. Para migraciones, use temporalmente una URL directa (`DATABASE_URL_UNPOOLED`) en un branch de prueba y después aplique el cambio de forma controlada a producción.

Para PostgreSQL local, copie `.env.example` a `.env`; elija `POSTGRES_PASSWORD` y construya `DATABASE_URL` con usuario/database `classroom`, host `127.0.0.1`, puerto `5432` y contraseña codificada para URL. No comparta ese archivo. Compose lee `.env`; para ejecutar contra esta configuración local exporte `DATABASE_URL` en la shell. Los scripts de Node cargan `.env.local` para la conexión administrada por Neon y las variables de la shell tienen prioridad.

```sh
docker compose up -d postgres
npm run db:check
docker compose stop postgres
```

Configure `DATABASE_URL` en `.env` o expórtela antes del check. El check ejecuta solamente `SELECT 1`, limita tiempos y cierra el pool incluso ante errores. Importar el paquete de base de datos no abre conexiones. Compose requiere contraseña, publica solo loopback y conserva datos en volumen; no se incluyen órdenes destructivas.

Esta máquina también tiene un PostgreSQL portátil ya inicializado en el puerto 54329:

```powershell
pwsh scripts/local-postgres.ps1 Start
$env:DATABASE_URL = (Get-Content .local/postgres/connection.env | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
npm run db:check
pwsh scripts/local-postgres.ps1 Status
pwsh scripts/local-postgres.ps1 Stop
```

Ese runtime y sus credenciales son locales, no forman parte del checkout.

## Límites y verificación

Vitest comprueba liveness/404, validación y limpieza del worker. Playwright inicia API y Vite y comprueba la página real y el estado de API. Sus puertos deben estar libres. No requiere credenciales de proveedores. `packages/github` construye Octokit sin efectuar peticiones; pg-boss está instalado pero nunca se inicia. No hay esquema académico ni paquete de dominio vacío.

La auditoría RR-01 identificó cuatro avisos moderados en la cadena de desarrollo Drizzle Kit → esbuild-kit → esbuild. No ejecutar Studio/esbuild serve ni `audit fix --force`. Una instalación offline no sustituye la auditoría online; los riesgos de producción se auditan por separado. Los gates RR-02–08, OQ-10–13, las decisiones propuestas AD-12–18 y R-01 siguen pendientes.


En esta máquina el navegador de Playwright está en el caché del proyecto. Antes de instalarlo o ejecutar E2E en PowerShell: ` $env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path $PWD '.local/playwright') `. En un checkout nuevo puede usar el caché predeterminado con las órdenes de instalación anteriores.


## RR-02 operational proof

The isolated PostgreSQL/pg-boss proof is available through `npm run rr02:proof` after starting the existing local PostgreSQL server and selecting the pinned Node runtime. It creates only uniquely named disposable databases/roles; it does not migrate `classroom_dev` or start business jobs. See [run instructions and limits](packages/database/rr02/README.md) and the [RR-02 PASS report](_bmad-output/planning-artifacts/architecture/architecture-Proyecto-Desarrollo-2026-09-11/reviews/RR-02.md). Proof data and failed runs are retained under ignored `.local/rr02`; no automatic destructive cleanup occurs.

## RR-03 sandbox proof

Separate experimental scripts verify the sandbox GitHub App and persist authenticated webhook receipts. Product API/startup remains unchanged. These proofs do not create academic identities, grant organization-admin authority, provision repositories, or execute business jobs. See [local commands and manual handoff](packages/database/rr03/README.md).
