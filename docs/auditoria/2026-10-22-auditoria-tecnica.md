# Auditoría técnica — Gobierno Corporativo RJB

_Fecha: 2026-10-22 · Corte: commit `69c6951` (rama `main`)_
_Destinatario: desarrollador responsable del proyecto_

## 1. Resumen

El MVP funciona de punta a punta: se construyó en 2 días (14 commits) y el código es limpio, con buena disciplina de dominio. Para llevarlo a las 7 empresas faltan cuatro cosas:

1. **Especificaciones verificables (SDD).** Hoy la spec es `CLAUDE.md` más los prompts de `ARRANQUE.md`. No hay requisitos con criterios de aceptación ni trazabilidad a pruebas.
2. **Entornos e infraestructura como código.** Hay una sola base, que también se usa para las pruebas de integración. Usuarios y roles se crean a mano, y no hay CI.
3. **Un pipeline de carga robusto.** Tiene un límite de tamaño que fallará en producción, procesa de forma síncrona sin transacción y puede dejar cargas atascadas.
4. **Pruebas reproducibles.** Las 11 pruebas con archivos reales se saltan en cualquier máquina sin `tests/fixtures/`. No hay pruebas de RLS ni pruebas E2E.

Las 5 acciones prioritarias:

| # | Acción | Por qué ahora |
|---|---|---|
| 1 | Subida directa a Storage con URL firmada | Archivos de más de 4,5 MB fallarán en Vercel |
| 2 | Aceptar la carga en una función SQL transaccional y reprocesar las atascadas | Hoy un fallo a mitad de camino deja datos o estados inconsistentes |
| 3 | Entornos separados (local / staging / prod) y CI en GitHub Actions | Las pruebas y los cambios de esquema tocan la base real |
| 4 | Fixtures anonimizados en el repo y pruebas de RLS con pgTAP | La seguridad del sistema depende de RLS y no se prueba |
| 5 | Specs por módulo en `docs/specs/` y plan de trabajo en `.plan/` | Lo que falta (admin, webhook, cartera, EEFF) se debe definir antes de codificar |

---

## 2. Estado actual

### Qué está construido

| Módulo | Estado | Ubicación |
|---|---|---|
| Login, roles, proxy de sesión | Hecho | `proxy.ts`, `lib/auth.ts`, `app/(auth)/login/` |
| Portal de carga con versionado, hash SHA-256 y auditoría | Hecho | `app/(app)/cargas/`, `lib/cargas/` |
| Parser y checks de INFORMES MULTI | Hecho | `lib/parser/informes-multi.ts`, `lib/checks/informes-multi.ts` |
| Parser y checks de PROVEEDORES, alerta ±20% | Hecho | `lib/parser/proveedores.ts`, `lib/kpi/alertas-proveedores.ts` |
| Cálculo de KPI y Dashboard de Gestión | Hecho | `lib/kpi/`, `app/(app)/gestion/` |
| Semáforo de cargas y avisos salientes (WhatsApp/correo) | Hecho | `app/(app)/inicio/`, `lib/notificaciones/` |
| Chat IA con herramientas bajo RLS | Hecho | `lib/ia/`, `app/api/chat/route.ts` |
| Informe de Junta por empresa y del Grupo | Hecho | `lib/informes/`, `app/(app)/informes/` |
| Administración (usuarios, empresas, KPI, metas) | **No existe**: pantalla "En construcción" | `app/(app)/admin/page.tsx` |
| Webhook de WhatsApp entrante | **No existe**, aunque `proxy.ts` ya lo excluye de la sesión | `RUTAS_SIN_SESION` en `proxy.ts` |
| Tipos `CARTERA_EPS` y `EEFF_ANUAL` | **Sin revisión automática**: quedan en `procesando` para siempre | `lib/cargas/procesar.ts:42` |
| Liquidez mínima, cartera por edades, metas reales | Bloqueado por el analista | — |

### Evidencia (ejecutada el 2026-10-22)

| Verificación | Resultado |
|---|---|
| `pnpm test` | 73 pasan, **11 se saltan** (requieren `tests/fixtures/`, ignorado por git) |
| `pnpm lint` | Sin errores |
| `next build` | Compila; 12 rutas |
| `tsc --noEmit` suelto | Falla con `PageProps`/`LayoutProps`, porque esos tipos los genera `next build`. Hay que agregar un script `typecheck` (ver 6.4) |
| Pruebas de integración | No se corrieron: requieren `.env.local` y apuntan a la base real |

### Lo que está bien y hay que conservar

- Reglas que no se negocian, escritas y respetadas en el código: N/D en lugar de 0, trazabilidad hoja/fila/columna y etiqueta de datos de demostración.
- RLS en las 14 tablas, `auditoria` inmutable por trigger y `service_role` solo en servidor.
- Funciones de cálculo puras y probadas (`lib/kpi/semaforo.ts`, `lib/informes/armar.ts`).
- Mensajes de error que dicen qué pasó y cómo corregirlo.
- Logs sin cifras: solo `error.code`.

---

## 3. Hallazgos en el código y cómo corregirlos

Orden: impacto en producción primero.

### H1. Los archivos de más de 4,5 MB fallarán en Vercel — Alta

**Qué pasa.** `next.config.ts` sube `serverActions.bodySizeLimit` a 25 MB y `lib/cargas/validacion.ts` permite 20 MB. Pero Vercel limita el cuerpo de una petición a una función a **4,5 MB**, así que un INFORMES MULTI con varias hojas fallará en producción con un error genérico.

**Cómo corregirlo.**
1. El servidor emite una URL firmada de subida: `admin.storage.from("cargas").createSignedUploadUrl(ruta)`, después de verificar sesión y `puede_cargar`.
2. El navegador sube directo a Supabase Storage con `uploadToSignedUrl`.
3. Una segunda Server Action recibe solo `{ carga_id }`, descarga el objeto desde Storage, calcula el SHA-256 y procesa.
4. Bajar `bodySizeLimit` al valor por defecto: ya no viajan archivos por la Server Action.

**Criterio de terminado.** Un archivo de 15 MB se carga en el despliegue de staging y queda `aceptada`.

### H2. El pipeline de carga no es transaccional — Alta

**Qué pasa.** `procesarCarga` hace 5 escrituras independientes: insertar hechos por lotes, marcar las versiones anteriores como no vigentes, marcar la carga como aceptada, calcular KPI y generar el informe. Los fallos se compensan a mano con `delete`. Si el proceso muere entre pasos (timeout, despliegue), quedan hechos huérfanos o dos versiones en un estado intermedio.

**Cómo corregirlo.** Mover el núcleo a una función de Postgres que corra en una sola transacción:

```sql
create function aceptar_carga(p_carga uuid, p_hechos jsonb, p_checks jsonb)
returns void language plpgsql security definer as $$
begin
  insert into hechos_financieros (...) select ... from jsonb_to_recordset(p_hechos) ...;
  update cargas set vigente = false where empresa_id = ... and id <> p_carga and vigente;
  update cargas set estado = 'aceptada', resultado_checks = p_checks where id = p_carga;
end $$;
```

KPI, avisos e informe quedan fuera de la transacción, como efectos posteriores que se pueden reintentar.

**Criterio de terminado.** Una prueba de integración que fuerce un error a mitad de la función deja la base exactamente como estaba.

### H3. Cargas atascadas en `procesando` — Alta

**Qué pasa.** Cuando el resultado es `error`, la carga queda en `procesando` y nada la retoma. Lo mismo pasa siempre con `CARTERA_EPS` y `EEFF_ANUAL`. En el semáforo de `/inicio` aparecen como "en proceso" indefinidamente.

**Cómo corregirlo.**
- Separar recibir de procesar: la acción de subida termina al crear la carga, y el proceso corre después con `after()` de `next/server`, o en una cola si el volumen crece.
- Agregar al cron diario un paso de reproceso para cargas en `procesando` con más de 15 minutos (idempotente: `aceptar_carga` borra e inserta dentro de la transacción).
- Para los tipos sin parser, agregar un estado explícito `recibida_sin_revision` o deshabilitarlos en el formulario hasta tener su spec.

### H4. El número de versión puede chocar — Baja

**Qué pasa.** `acciones.ts:81-90` lee la última versión y le suma 1. Dos subidas simultáneas de la misma empresa, tipo y periodo calculan el mismo número. La restricción `unique (empresa_id, tipo_archivo, periodo, version)` impide el duplicado, pero la segunda subida falla con "No se pudo registrar la carga" y el contador no sabe por qué.

**Cómo corregirlo.** Asignar la versión dentro de la base (en la misma función SQL de H2) o reintentar una vez cuando el insert falle por conflicto (código `23505`).

### H5. Ruta pública declarada sin implementación — Media

**Qué pasa.** `proxy.ts` exime `/api/whatsapp/webhook` de la sesión, pero la ruta no existe. Hoy no es explotable, pero quien la implemente puede asumir que el proxy ya la protege.

**Cómo corregirlo.**
- Si el webhook entra en el alcance: implementarlo verificando `X-Hub-Signature-256` con el *app secret* de Meta y `hub.verify_token` en el GET, con su propia spec (ver sección 4).
- Si no entra: quitar la ruta de `RUTAS_SIN_SESION` y de la estructura en `CLAUDE.md`.

### H6. La configuración se escribe por SQL, fuera de la auditoría — Media

**Qué pasa.** Sin `/admin`, usuarios, asignaciones, `kpi_definiciones` y `metas` se cargan con SQL a mano (como describe `ARRANQUE.md`). Esto rompe la regla del proyecto: "toda escritura pasa por Server Actions … y registra en `auditoria`". Las metas son justamente lo que el analista va a cambiar cada mes.

**Cómo corregirlo.** Priorizar dentro de `/admin`:
1. Metas por empresa, KPI y periodo.
2. Usuarios y asignaciones a empresas.
3. Definiciones de KPI.

Cada uno con Server Action, validación zod y registro en `auditoria`. Mientras tanto, los datos iniciales van en `supabase/seed.sql` (ver sección 5), no en el SQL Editor.

### H7. Pruebas que se saltan en silencio — Media

**Qué pasa.** Las 11 pruebas del parser con archivos reales usan `describe.skipIf(!existe)`. En una máquina nueva o en CI pasan en verde sin probar el parser real, que es el componente de más riesgo del sistema.

**Cómo corregirlo.** Ver la sección 6.2: fixtures anonimizados versionados, y en CI fallar si hay pruebas saltadas.

### H8. Observabilidad de errores — Baja

**Qué pasa.** Los `catch` registran `error.code` y nada más (bien por privacidad), pero sin el `carga_id` ni el paso donde ocurrió. Los avisos y el informe "nunca interrumpen la aceptación", así que un fallo ahí solo deja una línea en los logs, sin alerta.

**Cómo corregirlo.**
- Un logger mínimo en `lib/log.ts` que emita JSON con `{ evento, carga_id, empresa_id, paso, codigo }`, sin montos.
- Registrar en `auditoria` (o en una tabla `eventos_sistema`) los fallos de efectos posteriores, para mostrarlos en `/inicio` al admin.
- Revisar cada `catch`: notificar al usuario no basta, también tiene que quedar diagnosticable.

### H9. Costo y abuso del chat — Baja

**Qué pasa.** `/api/chat` no tiene límite de frecuencia. Además, los nombres de conceptos y terceros vienen de archivos subidos por contadores y llegan al prompt del modelo como datos.

**Cómo corregirlo.**
- Límite por usuario: por ejemplo, 30 preguntas por hora, contadas en `chat_mensajes`.
- En el prompt de sistema, tratar los resultados de las herramientas como datos y no como instrucciones.
- Una prueba que meta un concepto con texto de instrucción y verifique que no cambia la respuesta.

### H10. Documentación de entrada — Baja

`README.md` es la plantilla de `create-next-app`. Reemplazarlo por: qué es el sistema, cómo levantarlo en local (sección 5), cómo correr las pruebas y dónde están las specs.

---

## 4. SDD: de prompts a especificaciones verificables

### Diagnóstico

`CLAUDE.md` funciona bien como **constitución**: principios, convenciones, dominio. Lo que falta es la capa de **especificación por módulo**. Los prompts de `ARRANQUE.md` cumplieron ese papel, pero:

- no tienen criterios de aceptación verificables;
- no quedan enlazados a las pruebas ni a los commits;
- las decisiones tomadas durante la construcción (por ejemplo, "un fallo de KPI no revierte la aceptación") viven solo en comentarios del código.

### Estructura propuesta

Mantener `CLAUDE.md` como constitución y agregar:

```
docs/specs/
  carga-archivos/
    README.md         alcance, estado, enlaces
    requirements.md   requisitos en formato EARS, numerados
    design.md         flujo, modelo de datos, decisiones
    tasks.md          tareas por fase, marcadas al cerrarlas
  parser-informes-multi/
  kpi-semaforo/
  informe-junta/
  chat-ia/
  notificaciones/
  admin/              nuevo: se especifica antes de construir
  webhook-whatsapp/   nuevo
  cartera-edades/     nuevo, bloqueado por el analista
.plan/<TICKET>/       plan de ejecución de cada cambio
  definition.md · README.md · decisions.md · roadmap.md · changes.md · phases/
```

Para los módulos ya construidos, la spec se escribe **a partir del código actual** (ingeniería inversa) y sirve de línea base. Para los módulos nuevos, la spec va primero y se aprueba antes de codificar.

### Requisitos en formato EARS: ejemplos del dominio

```
CARGA-01  Cuando un contador sube un archivo, el sistema calculará su SHA-256
          antes de procesarlo y lo guardará en la carga.
CARGA-02  Si el archivo no pasa un check de nivel error, el sistema dejará la
          carga en estado rechazada con un motivo que indique la hoja y la fila.
CARGA-03  Cuando una carga queda aceptada, el sistema marcará como no vigente
          la versión aceptada anterior de la misma empresa, tipo y periodo.
CARGA-04  Mientras una carga esté en procesando por más de 15 minutos, el
          sistema la reprocesará en el siguiente ciclo del cron.
KPI-01    Si falta un insumo de un KPI, el sistema guardará estado = 'nd' con
          motivo_nd y nunca un valor 0.
SEM-01    Donde el KPI tenga sentido "más es mejor", el sistema mostrará verde
          cuando el valor sea ≥ la meta.
IA-01     Cuando el usuario pregunte por una empresa fuera de su permiso, el
          asistente responderá que no tiene acceso, sin revelar datos.
```

### Trazabilidad requisito → prueba

Cada prueba cita el requisito en su nombre, y una tabla en `requirements.md` muestra la cobertura:

```ts
it("CARGA-03: la versión anterior queda no vigente al aceptar", ...)
```

| Requisito | Prueba | Tipo |
|---|---|---|
| CARGA-01 | `tests/cargas-validacion.test.ts` | unitaria |
| CARGA-03 | `supabase/tests/cargas.sql` | pgTAP |
| KPI-01 | `tests/kpi.test.ts` | unitaria |
| IA-01 | `tests/integracion/herramientas-ia.test.ts` | integración |

Un requisito sin prueba es una brecha visible.

### Decisiones

Registrar en `design.md` (o en `decisions.md` del plan) las decisiones ya tomadas, numeradas y marcadas "no reabrir" cuando correspondan. Las que hoy están implícitas en el código:

- **D1.** Sin aprobación manual: los checks automáticos deciden si la carga queda aceptada o rechazada.
- **D2.** Un fallo al calcular KPI no revierte la aceptación de la carga.
- **D3.** Los terceros se crean con `tipo = 'otro'` y el analista los clasifica después.
- **D4.** La empresa se elige en el portal: el archivo no necesita columna Empresa.

### Forma de trabajo

1. Definición (`/define-service`), revisión, plan por fases (`/plan-service`), revisión.
2. Ejecutar una fase, verificarla **ejecutando** el flujo completo en staging y actualizar `tasks.md`.
3. Pausa de revisión antes de la siguiente fase.
4. Un commit por fase, por PR a `main` (hoy todo va directo a `main`).

---

## 5. Infraestructura como código y entornos

### Diagnóstico

| Pieza | Hoy | Como código |
|---|---|---|
| Esquema de BD | Migraciones en `supabase/migrations/` | ✅ |
| Bucket y políticas de Storage | Dentro de la migración inicial | ✅ |
| Datos base (empresas, tipos, KPI) | Mezclados en la migración inicial | Parcial |
| Usuarios, roles, asignaciones | SQL a mano (`ARRANQUE.md`) | ❌ |
| `supabase/seed.sql` | Declarado en `config.toml` pero no existe | ❌ |
| Proyecto Vercel, variables, cron | `vercel.json` (cron); variables cargadas a mano | Parcial |
| WhatsApp (Meta), Resend, Anthropic | Consolas, a mano | ❌ (documentar) |
| Entornos | Un solo proyecto Supabase, compartido con las pruebas | ❌ |

### Recomendaciones

1. **Tres entornos.**
   - **Local:** `supabase start` con Docker, migraciones y `seed.sql`.
   - **Staging:** un proyecto Supabase aparte, más los Preview Deployments de Vercel.
   - **Producción:** el proyecto actual.
2. **Separar esquema de datos.** Las migraciones llevan solo el esquema y los catálogos estables (`tipos_archivo`). La Empresa Demo, los usuarios de prueba (creados con `auth.admin.createUser` en un script `scripts/seed-usuarios.ts`) y las metas de demostración van en `supabase/seed.sql`, que solo corre en local y staging.
3. **Cambios de esquema solo por pipeline.** `supabase db push` contra producción solo desde GitHub Actions, con aprobación manual (*environment protection* de GitHub). Nadie ejecuta SQL de cambio en el editor de producción.
4. **Variables de entorno.**
   - Agregar un `.env.example` versionado con todas las claves de `ARRANQUE.md` y sin valores.
   - En Vercel, separar Preview y Production.
   - Validar las variables al arrancar con zod (`lib/env.ts`), para que la app falle de entrada si falta una clave, en lugar de fallar en la primera petición.
5. **Configuración de Vercel en código.** `vercel.json` ya tiene el cron. Si se agregan más reglas, pasarlo a `vercel.ts` (`@vercel/config`).
6. **Servicios externos.** Documentar en `docs/infra/servicios-externos.md` cómo configurar cada uno (app de Meta, número, plantillas aprobadas, dominio de Resend con SPF/DKIM, workspace de Anthropic) y quién tiene acceso. No se puede declarar como código, pero sí reproducir paso a paso.
7. **Tipos de BD.** Regenerar `lib/supabase/tipos.ts` en CI y fallar si difiere del versionado: así se detecta una migración sin tipos actualizados.

---

## 6. Pruebas

### 6.1 Pirámide propuesta

| Capa | Herramienta | Qué cubre | Dónde corre |
|---|---|---|---|
| Unitarias puras | vitest | Parser, checks, KPI, semáforo, formato, armado del informe | CI, cada PR |
| Base de datos | pgTAP (`supabase test db`) | **RLS por rol**, triggers, `puede_cargar`, función `aceptar_carga` | CI con Supabase local |
| Integración | vitest + Supabase local | Herramientas del chat, flujo de carga completo sin UI | CI con Supabase local |
| E2E | Playwright | Login por rol, subir archivo, ver estado, ver dashboard, generar informe | CI contra el Preview Deployment |

### 6.2 Fixtures anonimizados (prioridad)

- Crear `scripts/anonimizar-fixture.ts`. Debe conservar la estructura (hojas, títulos, posiciones), reemplazar NIT y nombres de terceros por valores sintéticos y multiplicar los montos por un factor aleatorio, manteniendo las sumas que validan los checks (por ejemplo, TOTAL RECAUDO).
- Versionar el resultado en `tests/fixtures/anonimizados/` y ajustar el `.gitignore` para permitir solo esa carpeta.
- Cambiar `skipIf` por fixtures obligatorios y agregar en CI un paso que falle si hay pruebas saltadas (`--reporter=json` y revisar `numPendingTests`).
- Agregar un fixture por cada caso límite que ya conocen: columna nueva, sección movida, mes vacío, variante de nombre con espacios.

### 6.3 RLS: lo más importante sin probar

La promesa de seguridad del sistema ("RLS decide qué ve") no tiene una sola prueba. Mínimo, en `supabase/tests/rls.sql`:

- El gerente de la empresa A no lee `hechos_financieros`, `kpi_resultados` ni `cargas` de la empresa B.
- El contador no lee `chat_mensajes` de otros usuarios ni escribe en ninguna tabla directamente.
- Nadie puede hacer `update` ni `delete` en `auditoria`, ni siquiera `service_role` (el trigger).
- Un usuario anónimo no lee nada.

### 6.4 Scripts de `package.json`

```json
"typecheck": "next typegen && tsc --noEmit",
"test:db": "supabase test db",
"test:e2e": "playwright test",
"verificar": "pnpm lint && pnpm typecheck && pnpm test && pnpm test:db"
```

Con `"test:integracion"` apuntando a Supabase local, nunca a la base real.

### 6.5 Pruebas de la IA

- Contrato de herramientas: cuando falta un dato, cada herramienta devuelve `resultado: "N/D"` con su `motivo` (ya está en parte).
- Evaluaciones del resumen y las alertas del informe: un conjunto fijo de `kpi_resultados` y verificaciones automáticas sobre la salida. No aparece ninguna cifra que no esté en los insumos; no usa "EBITDA" con datos del TD; incluye "DATOS DE DEMOSTRACIÓN" cuando corresponde. Correr con el modelo real en un job aparte (no en cada PR, por costo).

---

## 7. CI/CD, observabilidad y seguridad

### CI (GitHub Actions)

```
.github/workflows/
  ci.yml        en cada PR: install → lint → typecheck → test → supabase start →
                test:db → test:integracion → build → falla si hay pruebas saltadas
  e2e.yml       al terminar el Preview Deployment de Vercel: Playwright contra la URL
  migraciones.yml  al hacer merge a main: supabase db push a staging; a producción
                con aprobación manual
```

- Proteger `main`: merge solo por PR con CI en verde.
- Dependabot o Renovate para dependencias. `xlsx` viene de un tarball del CDN de SheetJS, así que hay que revisarlo a mano.

### Observabilidad

- El logger estructurado de H8.
- Un panel mínimo en `/inicio` para el admin: cargas en `procesando` con más de 15 minutos, fallos de avisos e informes generados con error.
- Alerta (correo al admin) cuando el cron de recordatorios falla o cuando una carga se reprocesa 3 veces sin éxito.

### Seguridad

| Tema | Estado | Recomendación |
|---|---|---|
| MFA | Pendiente (fuera del demo) | Obligatorio para founder y admin antes de producción; Supabase Auth trae TOTP |
| Webhook de WhatsApp | No existe | Verificación de firma `X-Hub-Signature-256` y spec propia (H5) |
| Límite de frecuencia del chat | No hay | H9 |
| Validación del archivo | Extensión y tamaño | Agregar verificación de tipo real (un .xlsx es un ZIP con `[Content_Types].xml`) antes de parsear |
| Secretos | Bien separados | Validación con zod al arrancar (sección 5) |
| Pentest | Pendiente | Después de RLS probado y MFA |

---

## 8. Plan de trabajo por fases

Cada fase se planifica en `.plan/<TICKET>/`, cierra con su criterio de terminado verificado ejecutando en staging y tiene una pausa de revisión antes de la siguiente.

| Fase | Contenido | Criterio de terminado | Depende de |
|---|---|---|---|
| 0. Base de trabajo | Entorno local con `supabase start` y `seed.sql`; `.env.example`; `lib/env.ts`; script `typecheck`; README real; ramas y PR | Un desarrollador nuevo levanta el sistema y corre `pnpm verificar` en menos de 30 minutos | — |
| 1. Red de seguridad | Fixtures anonimizados; pgTAP de RLS; `ci.yml`; integración contra base local | CI en verde, 0 pruebas saltadas, las 4 pruebas de RLS de 6.3 pasan | 0 |
| 2. Specs de línea base | `docs/specs/` de los 6 módulos construidos, con requisitos EARS y tabla de trazabilidad | Cada requisito tiene una prueba o figura como brecha | 1 |
| 3. Pipeline de carga robusto | H1 (URL firmada), H2 (`aceptar_carga`), H3 (proceso posterior y reproceso), H4 (versión) | Archivo de 15 MB aceptado en staging; error forzado sin estado inconsistente; carga atascada reprocesada | 1, 2 |
| 4. Entornos y despliegue | Staging en Supabase; `migraciones.yml` con aprobación; E2E en Preview | Una migración llega a producción solo por pipeline | 1 |
| 5. Administración | Spec y construcción de `/admin`: metas, usuarios, KPI, con auditoría | El analista carga metas sin SQL; cada cambio queda en `auditoria` | 2 |
| 6. Producción para 7 empresas | MFA; webhook de WhatsApp (si entra al alcance); límite del chat; observabilidad; pentest | Lista de verificación de salida a producción aprobada | 3, 4, 5 |
| — | Cartera por edades, liquidez mínima, `EEFF_ANUAL` | Spec aprobada con el analista antes de codificar | Formato del analista |

## Preguntas abiertas

- ¿El webhook de WhatsApp entrante (el Founder pregunta por WhatsApp) entra en el alcance de la primera salida a producción?
- ¿Quién administra las cuentas de Supabase, Vercel, Meta y Resend, y quién aprueba los despliegues a producción?
- ¿Hay presupuesto para un segundo proyecto Supabase (staging)? Si no lo hay, Supabase Branching es la alternativa.
- ¿Cuándo entrega el analista el formato de cartera por edades y liquidez mínima?
