# Arranque — hoy viernes

## 1. Cuentas (si falta alguna)
- Supabase: crear proyecto `gobierno-rjb`, región São Paulo (sa-east-1). Guardar la contraseña de la BD.
- Vercel, GitHub (repo privado `gobierno-rjb`), Resend, consola de Anthropic (API key).
- Meta for Developers: app tipo Business → producto WhatsApp → número de prueba; registrar tu celular
  y el del Founder como destinatarios.

## 2. Crear el proyecto (PowerShell)
```powershell
pnpm create next-app@latest gobierno-rjb --ts --tailwind --eslint --app --import-alias "@/*" --use-pnpm
cd gobierno-rjb
pnpm add @supabase/supabase-js @supabase/ssr zod @anthropic-ai/sdk recharts resend
pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
pnpm add -D supabase vitest
pnpm supabase init
pnpm supabase login
pnpm supabase link --project-ref TU_PROJECT_REF
```
Copiar `CLAUDE.md` a la raíz y la migración a `supabase/migrations/`, luego:
```powershell
pnpm supabase db push
pnpm supabase gen types typescript --linked > lib/supabase/tipos.ts
git init; git add .; git commit -m "Esquema inicial y CLAUDE.md"
```

## 3. `.env.local` (nunca al repo)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-fable-5-1
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
RESEND_API_KEY=
CRON_SECRET=
```

## 4. Usuarios del demo
En Supabase › Authentication › Add user: tú (admin), Founder (founder), un contador.
Luego en el SQL Editor:
```sql
insert into perfiles (id, nombre, email, telefono_whatsapp, rol) values
  ('UUID_BRIAN',    'Brian Ciprian', 'correo', '57...', 'admin'),
  ('UUID_FOUNDER',  'Founder',       'correo', '57...', 'founder'),
  ('UUID_CONTADOR', 'Contador Multisalud', 'correo', null, 'contador');
insert into usuario_empresa (usuario_id, empresa_id)
  select 'UUID_CONTADOR', id from empresas where slug = 'multisalud';
```

## 5. Prompts para Claude Code (uno por bloque, en orden)

**Bloque 1 — Base y login**
> Lee CLAUDE.md. Crea lib/supabase/{client,server,admin}.ts con @supabase/ssr, middleware que proteja
> todo bajo (app), página /login con correo y contraseña, layout con encabezado "GRUPO RJB" según el
> diseño de CLAUDE.md, menú según rol y lib/auditoria.ts que registre login. Verifica con pnpm build.

**Bloque 2 — Portal de carga**
> Crea /cargas: el contador ve sus empresas, elige tipo de archivo, periodo y carácter
> (preliminar/definitivo), sube un .xlsx. Server Action: valida con zod, verifica puede_cargar(),
> calcula SHA-256, sube a Storage en {empresa_id}/{periodo}/{uuid}.xlsx, crea la carga en
> 'procesando', marca la versión anterior como no vigente y registra auditoría. Muestra historial
> con estado y motivo de rechazo.

**Bloque 3 — Parser y checks**
> Crea lib/parser/informes-multi.ts que lea TD, cartera y TD ING RET detectando secciones por título
> (ver CLAUDE.md) y devuelva hechos con hoja/fila/columna de origen. Crea lib/checks con: secciones
> encontradas, total recaudo cuadra con su fila, último mes con datos, sin duplicados, sin valores no
> numéricos. Integra al flujo de carga: aceptada o rechazada con motivo. Pruebas con vitest usando el
> archivo de tests/fixtures.

**Bloque 4 — KPI y Dashboard de Gestión**
> Crea lib/kpi/calcular.ts que, al aceptar una carga, calcule los KPI de kpi_definiciones y guarde
> kpi_resultados con insumos y estado (nd con motivo si falta un dato). Crea /gestion con filtros de
> empresa y mes, tarjetas KPI (valor mes, acumulado, variación vs mes anterior, mini tendencia) y
> gráficos: ingresos vs costos, ingresos vs recaudo, recaudo vs pagos, flujo neto, cartera; top 5
> entidades por ingresos, recaudo y cartera, y top categorías de gasto.

**Bloque 5 — Semáforo y avisos**  ·  **Bloque 6 — Chat IA con sugerencias**  ·  **Bloque 7 — Resumen WhatsApp**
(los prompts de estos bloques se arman el sábado con lo que haya salido de los anteriores)
