# Gobierno Corporativo RJB — Sistema de información financiera

## Qué es
Plataforma web donde los contadores de las empresas del Grupo RJB suben sus archivos mensuales y anuales.
El sistema valida cada archivo, lo normaliza en base de datos, calcula KPI y los muestra en tableros en
línea para el Founder. Una capa de IA envía resúmenes y alertas por WhatsApp/correo y responde preguntas
en un chat con sugerencias (incluidos cruces entre empresas: proveedores y EPS compartidos).

Empresas: AMECOL, Ambulancias del Llano, Clínica Emperatriz, Multisalud IPS, Sikuani, Travel del Llano
(+ "Empresa Demo", marcada `es_demo = true`, solo para demostraciones).

Equipo: Brian (desarrollador, dueño del producto) + Claude. El analista financiero NO aprueba cargas:
define KPI, fórmulas, metas y umbrales; eso se guarda como configuración (`kpi_definiciones`, `metas`).

## Principios innegociables
1. **No inventar datos.** Ningún número aparece sin fuente. Si un KPI no se puede calcular: `estado = 'nd'`
   con `motivo_nd` explicando qué falta. Un dato faltante nunca se convierte en 0.
2. **Trazabilidad.** Tablero → `kpi_resultados` (con `insumos` y `formula_version`) → `hechos_financieros`
   (con hoja, fila y columna de origen) → `cargas` (archivo original en Storage con hash SHA-256).
3. **Estado del dato visible siempre:** real · calculado · meta · N/D. Datos de empresas demo llevan la
   etiqueta "DATOS DE DEMOSTRACIÓN" en toda pantalla donde aparezcan.
4. **La IA solo narra lo calculado.** Consulta `kpi_resultados` y vistas; nunca lee archivos crudos, nunca
   estima, nunca ve empresas fuera del permiso del usuario que pregunta. Si no hay dato, dice "N/D".
5. **"Crea valor / destruye valor"** solo con criterio explícito (ROIC > WACC, EVA > 0).
6. **No llamar EBITDA ni utilidad operacional** a ingresos − costos del informe mensual (TD). Usar
   "Excedente entre ingresos y costos/gastos". Recaudo − pagos = "Flujo neto de caja operativo".
   EBITDA, utilidad operacional y neta solo existen cuando vienen como líneas de los estados financieros
   anuales (`EEFF_ANUAL`); ahí sí se usan con su nombre contable.

## Validación de cargas (sin aprobación manual)
- Los checks automáticos son el filtro: archivo que no pasa → `rechazada` con motivo claro; pasa → `aceptada`.
- El contador marca `caracter`: `preliminar` o `definitivo`. El Founder ve la etiqueta.
- Re-subir crea una versión nueva; la anterior queda con `vigente = false`. Nada se borra.

## Informe mensual para la Junta Directiva (feedback del analista, sept. 2026)
Entregable principal del sistema: **2 páginas por empresa + 1 de resumen del Grupo**, legible en 5 minutos.
Se arma con los mismos datos del tablero; el gerente solo escribe lo que los números no explican.
- Secciones automáticas: (1) Resumen del mes — lo redacta la IA solo con KPI calculados y semáforos;
  (2) Tablero de indicadores con semáforo contra meta; (3) Caja: recaudo vs **liquidez mínima requerida**
  → excedente o déficit; (4) Cartera: edades (0–90, 91–180, 181–360, >360) y 5 mayores deudores con
  cambio vs mes anterior; (5) Alertas del mes — todo indicador en amarillo o rojo, redactadas por la IA.
- Bloques del gerente (texto editable): causas y acciones por alerta, hechos relevantes (máx. 5),
  decisiones que se piden a la Junta, estado de compromisos anteriores.
- El informe sale igual aunque el gerente no escriba: se marca "pendiente de comentario".
- Calendario (días hábiles tras el cierre): día 5 carga · día 6 el sistema calcula y la IA genera el
  borrador · día 8 el gerente completa y aprueba · día 9 revisión financiera · envío 3 días antes de la Junta.

### Semáforo contra meta (regla única para todos los indicadores)
| Estado | "Más es mejor" | "Menos es mejor" |
|---|---|---|
| Verde | ≥ meta | ≤ meta |
| Amarillo | entre 90% y 99,9% de la meta | hasta 10% por encima de la meta |
| Rojo | < 90% de la meta | > 10% por encima de la meta |
| Sin meta (gris) | la meta no está cargada | la meta no está cargada |
Excepciones: el flujo neto / excedente de caja es rojo siempre que sea negativo; días de proveedores se
evalúa como rango (±10% de la meta). `sentido = neutro` no lleva semáforo. Las metas las define el
analista en `metas` (por empresa, KPI y periodo); el sistema nunca las inventa.

### Datos que el INFORMES MULTI no trae (formato por cerrar con el analista)
- **Liquidez mínima requerida**: costos y gastos que se pagan sí o sí cada mes (nómina, arriendos,
  servicios, proveedores críticos). Hasta que exista en el archivo → N/D.
- **Cartera por edades** y **facturación mensual por proveedor** (archivo PROVEEDORES: NIT, días de
  cartera, concepto, meses). Alerta de proveedor: desviación del mes vs promedio de 6 meses previos,
  umbral ±20%, tipo "Superior" o "Inferior".
- Tipos de archivo ya previstos en `tipos_archivo`: `CARTERA_EPS`, `PAGOS_PROVEEDOR`, `EEFF_ANUAL`.
- La carga sigue siendo por el portal web (no por carpeta de Drive): la empresa se elige al subir, así
  no hace falta la "columna Empresa" del formato del analista.

## Stack
- Next.js (App Router, TypeScript estricto) + Tailwind
- Supabase: Postgres + Auth + Storage, con **Row Level Security** en todas las tablas
- SheetJS (`xlsx` desde cdn.sheetjs.com) para leer Excel en el servidor
- Recharts para gráficos
- Anthropic SDK (`@anthropic-ai/sdk`) para chat y resúmenes; modelo en `ANTHROPIC_MODEL`
- WhatsApp Cloud API (Meta) y Resend para correo
- Despliegue en Vercel

## Seguridad
- Lectura desde el cliente: siempre con la sesión del usuario (RLS decide qué ve).
- **Toda escritura pasa por Server Actions / Route Handlers** que: (1) verifican sesión y rol, (2) verifican
  permiso sobre la empresa, (3) escriben con el cliente `service_role`, (4) registran en `auditoria`.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo en servidor. Nunca prefijo `NEXT_PUBLIC_`.
- Validar toda entrada con zod. Archivos: solo .xlsx, máximo 20 MB, se calcula hash antes de procesar.
- `auditoria` es append-only (trigger bloquea UPDATE/DELETE).
- Nunca registrar en logs cifras financieras completas ni datos personales.

## Roles
| Rol | Ve | Puede |
|---|---|---|
| founder | todas las empresas | ver tableros, chat, recibir avisos |
| admin | todas | todo, gestionar usuarios y configuración |
| gerente | sus empresas | ver tableros de sus empresas |
| contador | sus empresas | subir archivos de sus empresas, ver estado de sus cargas |

## Estructura
```
app/
  (auth)/login/
  (app)/inicio/            semáforo de cargas + resumen
  (app)/cargas/            portal del contador
  (app)/gestion/           Dashboard de Gestión mensual
  (app)/chat/              chat IA con sugerencias
  (app)/informes/          borrador del informe de Junta por empresa (2 páginas, imprimible)
  (app)/admin/             usuarios, empresas, KPI
  api/whatsapp/webhook/    mensajes entrantes del Founder
  api/cron/recordatorios/  recordatorios diarios
lib/
  supabase/{client,server,admin}.ts
  parser/                  detección de secciones por texto + normalización
  checks/                  controles de integridad de cada carga
  kpi/                     cálculo de KPI desde kpi_definiciones, comparaciones, semáforo contra meta
  ia/                      herramientas del chat, sugerencias, resumen y alertas del informe de Junta
  informes/                armado de datos del informe (puro) y persistencia en informes_junta
  notificaciones/{whatsapp,email}.ts
  formato.ts               formatos COP M, %, x, días
  auditoria.ts
supabase/migrations/
```

## Lectura de INFORMES MULTI (hoja TD, cartera, TD ING RET)
- Detectar secciones por TÍTULO (INGRESOS, COSTOS Y GASTOS, RECAUDO, TOTAL RECAUDO, PAGOS), nunca por
  posición fija. Tolerar filas/columnas nuevas cada mes.
- Detectar meses por encabezado; el último mes cargado es el último con algún valor ≠ vacío.
- Total recaudo = recaudo por entidad + recaudo por medio de pago; validar contra la fila "TOTAL RECAUDO".
- Guardar cada valor en `hechos_financieros` con hoja/fila/columna de origen.
- Terceros (EPS, proveedores): normalizar NIT (solo dígitos, sin DV) y enlazar a `terceros`.
- La lógica de referencia ya existe en el tablero HTML mensual del proyecto; portarla, no reinventarla.

## Formatos
- Dinero: COP millones, `$5.846,0 M` (separador de miles `.`, decimal `,`).
- Porcentaje: 1 decimal (`43,3%`). Puntos porcentuales: `p.p.`. Ratios: `0,13x`. Días: `148 días`.
- Comparación mensual: mes actual vs mes anterior, acumulado del año, promedio mensual, meta si existe.
  Sin base histórica → no hay comparación interanual.
- Meta no definida → "Sin meta definida".

## Diseño
Referencia: screenshot del tablero del Grupo RJB (encabezado azul oscuro con "GRUPO RJB" y nombre del
tablero, filtros arriba, tarjetas KPI con valor, variación y mini tendencia, mucho espacio blanco).
- Colores: `--navy #0A2342`, `--azul #0B5CAD`, `--turquesa #179E8F`, `--rojo #C93A3A` (solo alertas o
  deterioro), `--gris-fondo #F3F5F8`, `--gris-texto #5B6573`, blanco.
- Tipografía: una familia sans con cifras tabulares (Inter o IBM Plex Sans), números grandes en KPI.
- Sin gráficos 3D, sin degradados decorativos. Rojo nunca como color decorativo.
- Textos en español, voz activa, frases cortas. Errores dicen qué pasó y cómo corregirlo.
- Responsive: el Founder lo usará en el celular.

## Convenciones de código
- TypeScript estricto, sin `any`. Nombres de dominio en español (`empresa`, `carga`, `periodo`).
- `periodo` siempre es `date` primer día del mes (`2026-07-01`).
- Montos en BD: `numeric(20,2)` en pesos completos; la conversión a millones es solo de presentación.
- Funciones de cálculo puras y con pruebas (vitest) usando archivos reales de muestra en `tests/fixtures/`.
- Commits pequeños, uno por bloque funcional. No subir archivos financieros reales al repo
  (`tests/fixtures/` va en `.gitignore` salvo archivos anonimizados).

## Comandos
```
pnpm dev                 servidor local
pnpm test                pruebas unitarias (puras)
pnpm test:integracion    pruebas contra la base real (gerente demo; requiere .env.local)
pnpm lint
supabase db push         aplicar migraciones
supabase gen types typescript --linked > lib/supabase/tipos.ts
```

## Estado actual
Hechos (bloques 1–6): login + roles, portal de carga con versionado, parser INFORMES MULTI + checks,
KPI y Dashboard de Gestión, semáforo de cargas y avisos WhatsApp/correo, chat IA con sugerencias.
Bloque 7: informe de Junta por empresa (resumen y alertas por IA, tablero con semáforo, bloques del
gerente, aprobación, imprimible) + resumen del Grupo. Archivo PROVEEDORES (`PAGOS_PROVEEDOR`): parser,
checks y alerta ±20% vs promedio de 6 meses en /gestion. Pendiente con el analista: formato del mes
con liquidez mínima y cartera por edades, metas reales (hoy solo hay metas de demostración en Empresa Demo).
Fuera del demo: MFA obligatorio, tableros anuales, pruebas de penetración, despliegue a las 7 empresas.
