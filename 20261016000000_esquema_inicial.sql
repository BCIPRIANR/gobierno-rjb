-- =====================================================================
-- Gobierno Corporativo RJB — esquema inicial
-- Principio: lecturas con RLS; escrituras solo desde el servidor (service_role).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type rol_usuario    as enum ('founder', 'admin', 'gerente', 'contador');
create type estado_carga   as enum ('procesando', 'aceptada', 'rechazada');
create type caracter_carga as enum ('preliminar', 'definitivo');
create type estado_dato    as enum ('real', 'calculado', 'meta', 'nd');
create type periodicidad   as enum ('mensual', 'anual');

-- ---------- Empresas y usuarios ----------
create table empresas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  nit        text unique,
  slug       text not null unique,
  es_demo    boolean not null default false,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table perfiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  nombre             text not null,
  email              text not null,
  telefono_whatsapp  text,              -- formato E.164 sin '+', ej. 573001234567
  rol                rol_usuario not null,
  activo             boolean not null default true,
  creado_en          timestamptz not null default now()
);

create table usuario_empresa (
  usuario_id  uuid not null references perfiles(id) on delete cascade,
  empresa_id  uuid not null references empresas(id) on delete cascade,
  primary key (usuario_id, empresa_id)
);

-- ---------- Archivos esperados y cargas ----------
create table tipos_archivo (
  codigo        text primary key,
  nombre        text not null,
  periodicidad  periodicidad not null,
  dia_limite    smallint not null check (dia_limite between 1 and 28), -- día del mes siguiente
  obligatorio   boolean not null default true,
  descripcion   text
);

create table cargas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id),
  tipo_archivo     text not null references tipos_archivo(codigo),
  periodo          date not null check (extract(day from periodo) = 1),
  version          int  not null default 1,
  vigente          boolean not null default true,
  estado           estado_carga not null default 'procesando',
  caracter         caracter_carga not null default 'preliminar',
  nombre_archivo   text not null,
  storage_path     text not null,
  hash_sha256      text not null,
  resultado_checks jsonb not null default '[]'::jsonb,  -- [{codigo, ok, mensaje}]
  motivo_rechazo   text,
  subido_por       uuid not null references perfiles(id),
  subido_en        timestamptz not null default now(),
  unique (empresa_id, tipo_archivo, periodo, version)
);
create unique index cargas_una_vigente
  on cargas (empresa_id, tipo_archivo, periodo)
  where vigente and estado = 'aceptada';

-- ---------- Terceros (EPS, proveedores) — llave de cruce entre empresas ----------
create table terceros (
  id            uuid primary key default gen_random_uuid(),
  nit           text not null unique check (nit ~ '^[0-9]+$'),  -- solo dígitos, sin DV
  razon_social  text not null,
  tipo          text not null default 'otro' check (tipo in ('eps', 'proveedor', 'otro')),
  creado_en     timestamptz not null default now()
);

-- ---------- Datos normalizados ----------
create table hechos_financieros (
  id              bigint generated always as identity primary key,
  carga_id        uuid not null references cargas(id) on delete cascade,
  empresa_id      uuid not null references empresas(id),
  periodo         date not null check (extract(day from periodo) = 1),
  seccion         text not null check (seccion in (
                    'ingresos', 'costos_gastos', 'recaudo_entidad', 'recaudo_medio_pago',
                    'pagos', 'cartera', 'personal_ingreso', 'personal_retiro', 'planta')),
  concepto        text not null,          -- entidad, categoría o cargo tal como viene
  tercero_id      uuid references terceros(id),
  valor           numeric(20,2) not null, -- pesos completos (o personas en secciones de personal)
  unidad          text not null default 'COP' check (unidad in ('COP', 'personas')),
  hoja_origen     text not null,
  fila_origen     int,
  columna_origen  text
);
create index hechos_empresa_periodo_seccion on hechos_financieros (empresa_id, periodo, seccion);
create index hechos_tercero on hechos_financieros (tercero_id) where tercero_id is not null;

-- ---------- KPI (configuración del analista) y resultados ----------
create table kpi_definiciones (
  codigo          text primary key,
  nombre          text not null,
  definicion      text not null,         -- explicación para un gerente
  formula_texto   text not null,
  unidad          text not null check (unidad in ('cop', 'pct', 'x', 'dias', 'personas')),
  sentido         text not null check (sentido in ('mayor_mejor', 'menor_mejor', 'neutro')),
  periodicidad    periodicidad not null,
  umbral_alerta   numeric,               -- null = sin umbral definido por el analista
  umbral_ok       numeric,
  version         int not null default 1,
  activo          boolean not null default true,
  fuente          text not null
);

create table kpi_resultados (
  id               bigint generated always as identity primary key,
  empresa_id       uuid not null references empresas(id),
  periodo          date not null check (extract(day from periodo) = 1),
  kpi_codigo       text not null references kpi_definiciones(codigo),
  valor            numeric,
  estado           estado_dato not null,
  motivo_nd        text,
  insumos          jsonb not null default '{}'::jsonb,  -- valores y carga_ids usados
  formula_version  int not null,
  calculado_en     timestamptz not null default now(),
  unique (empresa_id, periodo, kpi_codigo),
  check (estado <> 'nd' or motivo_nd is not null),
  check (estado = 'nd' or valor is not null)
);

create table metas (
  empresa_id    uuid not null references empresas(id),
  kpi_codigo    text not null references kpi_definiciones(codigo),
  periodo       date not null check (extract(day from periodo) = 1),
  valor         numeric not null,
  aprobada      boolean not null default false,
  definida_por  uuid references perfiles(id),
  nota          text,
  primary key (empresa_id, kpi_codigo, periodo)
);

-- ---------- Notificaciones, chat y auditoría ----------
create table notificaciones (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references perfiles(id),
  empresa_id      uuid references empresas(id),
  canal           text not null check (canal in ('whatsapp', 'email', 'app')),
  tipo            text not null,   -- recordatorio_carga, carga_aceptada, carga_rechazada, resumen, alerta
  asunto          text,
  cuerpo          text not null,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'enviada', 'fallida')),
  error           text,
  creado_en       timestamptz not null default now(),
  enviado_en      timestamptz
);

create table chat_mensajes (
  id               bigint generated always as identity primary key,
  conversacion_id  uuid not null,
  usuario_id       uuid not null references perfiles(id),
  canal            text not null default 'web' check (canal in ('web', 'whatsapp')),
  rol              text not null check (rol in ('user', 'assistant', 'tool')),
  contenido        text not null,
  metadatos        jsonb not null default '{}'::jsonb,   -- herramientas usadas, KPI citados
  creado_en        timestamptz not null default now()
);
create index chat_conversacion on chat_mensajes (conversacion_id, creado_en);

create table auditoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid,
  accion      text not null,     -- login, subir_carga, ver_tablero, consulta_chat, ...
  entidad     text,
  entidad_id  text,
  detalle     jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now()
);

create or replace function bloquear_cambios_auditoria() returns trigger
language plpgsql as $$
begin
  raise exception 'La auditoría es de solo inserción';
end $$;

create trigger auditoria_inmutable
  before update or delete on auditoria
  for each row execute function bloquear_cambios_auditoria();

-- =====================================================================
-- Funciones de permisos (security definer para leer perfiles sin recursión de RLS)
-- =====================================================================
create or replace function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create or replace function ve_todo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() in ('founder', 'admin'), false)
$$;

create or replace function puede_ver_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select ve_todo() or exists (
    select 1 from usuario_empresa ue
    join perfiles p on p.id = ue.usuario_id and p.activo
    where ue.usuario_id = auth.uid() and ue.empresa_id = p_empresa)
$$;

-- Usada por el servidor antes de aceptar una carga (no por RLS)
create or replace function puede_cargar(p_usuario uuid, p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles p
    where p.id = p_usuario and p.activo
      and (p.rol = 'admin'
           or (p.rol = 'contador' and exists (
                 select 1 from usuario_empresa ue
                 where ue.usuario_id = p_usuario and ue.empresa_id = p_empresa))))
$$;

-- =====================================================================
-- Row Level Security: solo políticas de lectura. Sin políticas de escritura = escritura
-- bloqueada para clientes; el servidor escribe con service_role.
-- =====================================================================
alter table empresas           enable row level security;
alter table perfiles           enable row level security;
alter table usuario_empresa    enable row level security;
alter table tipos_archivo      enable row level security;
alter table cargas             enable row level security;
alter table terceros           enable row level security;
alter table hechos_financieros enable row level security;
alter table kpi_definiciones   enable row level security;
alter table kpi_resultados     enable row level security;
alter table metas              enable row level security;
alter table notificaciones     enable row level security;
alter table chat_mensajes      enable row level security;
alter table auditoria          enable row level security;

create policy leer_empresas on empresas for select to authenticated
  using (puede_ver_empresa(id));
create policy leer_perfiles on perfiles for select to authenticated
  using (id = auth.uid() or ve_todo());
create policy leer_usuario_empresa on usuario_empresa for select to authenticated
  using (usuario_id = auth.uid() or ve_todo());
create policy leer_tipos_archivo on tipos_archivo for select to authenticated using (true);
create policy leer_cargas on cargas for select to authenticated
  using (puede_ver_empresa(empresa_id));
create policy leer_terceros on terceros for select to authenticated using (true);
create policy leer_hechos on hechos_financieros for select to authenticated
  using (puede_ver_empresa(empresa_id));
create policy leer_kpi_def on kpi_definiciones for select to authenticated using (true);
create policy leer_kpi_res on kpi_resultados for select to authenticated
  using (puede_ver_empresa(empresa_id));
create policy leer_metas on metas for select to authenticated
  using (puede_ver_empresa(empresa_id));
create policy leer_notificaciones on notificaciones for select to authenticated
  using (destinatario_id = auth.uid() or ve_todo());
create policy leer_chat on chat_mensajes for select to authenticated
  using (usuario_id = auth.uid());
create policy leer_auditoria on auditoria for select to authenticated
  using (rol_actual() = 'admin');

-- =====================================================================
-- Vistas y funciones de consulta (respetan RLS del usuario que consulta)
-- =====================================================================

-- Semáforo: quién cargó, quién no y cuántos días de atraso, para un periodo
create or replace function semaforo_cargas(p_periodo date)
returns table (
  empresa_id   uuid,
  empresa      text,
  es_demo      boolean,
  tipo_archivo text,
  fecha_limite date,
  estado       text,
  caracter     caracter_carga,
  ultima_carga timestamptz,
  dias_atraso  int
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select e.id, e.nombre, e.es_demo, t.codigo,
           (p_periodo + interval '1 month' + (t.dia_limite - 1) * interval '1 day')::date as limite
    from empresas e cross join tipos_archivo t
    where e.activa and t.periodicidad = 'mensual' and t.obligatorio
  )
  select b.id, b.nombre, b.es_demo, b.codigo, b.limite,
         case when c.id is not null then 'cargado'
              when current_date > b.limite then 'atrasado'
              else 'pendiente' end,
         c.caracter,
         c.subido_en,
         case when c.id is null then greatest(0, current_date - b.limite) else 0 end
  from base b
  left join lateral (
    select c.id, c.caracter, c.subido_en
    from cargas c
    where c.empresa_id = b.id and c.tipo_archivo = b.codigo and c.periodo = p_periodo
      and c.estado = 'aceptada' and c.vigente
    order by c.version desc limit 1
  ) c on true
  order by b.es_demo, b.nombre, b.codigo
$$;

-- Terceros (proveedores / EPS) presentes en más de una empresa, por periodo y sección
create view v_terceros_compartidos with (security_invoker = true) as
select t.id               as tercero_id,
       t.nit,
       t.razon_social,
       t.tipo,
       h.seccion,
       h.periodo,
       count(distinct h.empresa_id)               as num_empresas,
       array_agg(distinct e.nombre order by e.nombre) as empresas,
       bool_or(e.es_demo)                          as incluye_demo,
       sum(h.valor)                                as valor_total
from hechos_financieros h
join terceros t on t.id = h.tercero_id
join empresas e on e.id = h.empresa_id
join cargas  c on c.id = h.carga_id and c.vigente and c.estado = 'aceptada'
group by t.id, t.nit, t.razon_social, t.tipo, h.seccion, h.periodo
having count(distinct h.empresa_id) > 1;

-- =====================================================================
-- Storage: bucket privado. Ruta: {empresa_id}/{periodo}/{uuid}.xlsx
-- =====================================================================
insert into storage.buckets (id, name, public) values ('cargas', 'cargas', false)
on conflict (id) do nothing;

create policy leer_archivos_cargas on storage.objects for select to authenticated
  using (bucket_id = 'cargas' and puede_ver_empresa(((storage.foldername(name))[1])::uuid));

-- =====================================================================
-- Datos iniciales
-- =====================================================================
insert into empresas (nombre, slug, es_demo) values
  ('AMECOL',                 'amecol',                false),
  ('Ambulancias del Llano',  'ambulancias-del-llano', false),
  ('Clínica Emperatriz',     'clinica-emperatriz',    false),
  ('Multisalud IPS',         'multisalud',            false),
  ('Sikuani',                'sikuani',               false),
  ('Travel del Llano',       'travel-del-llano',      false),
  ('Empresa Demo',           'empresa-demo',          true);

insert into tipos_archivo (codigo, nombre, periodicidad, dia_limite, obligatorio, descripcion) values
  ('INFORME_MENSUAL', 'Informe mensual de gestión (formato INFORMES MULTI)', 'mensual', 10, true,
     'Hojas TD, cartera y TD ING RET'),
  ('PAGOS_PROVEEDOR', 'Pagos por proveedor con NIT', 'mensual', 10, false,
     'Necesario para cruzar proveedores entre empresas'),
  ('CARTERA_EPS',     'Cartera por EPS/pagador con NIT', 'mensual', 10, false,
     'Necesario para cruzar EPS entre empresas'),
  ('EEFF_ANUAL',      'Estados financieros anuales', 'anual', 28, true,
     'Balance general y estado de resultados');

-- KPI mensuales del demo. Umbrales en null: los define el analista ("Sin meta definida").
insert into kpi_definiciones (codigo, nombre, definicion, formula_texto, unidad, sentido, periodicidad, fuente) values
  ('ingresos',            'Ingresos', 'Lo facturado en el mes',
     'Suma sección INGRESOS del mes', 'cop', 'mayor_mejor', 'mensual', 'TD › INGRESOS'),
  ('costos_gastos',       'Costos y gastos', 'Lo gastado en el mes',
     'Suma sección COSTOS Y GASTOS del mes', 'cop', 'menor_mejor', 'mensual', 'TD › COSTOS Y GASTOS'),
  ('pct_costos_ingresos', 'Costos/gastos sobre ingresos', 'Cuánto de cada peso facturado se va en costos y gastos',
     'Costos y gastos ÷ Ingresos', 'pct', 'menor_mejor', 'mensual', 'TD'),
  ('excedente',           'Excedente entre ingresos y costos/gastos', 'Diferencia entre lo facturado y lo gastado (no es EBITDA)',
     'Ingresos − Costos y gastos', 'cop', 'mayor_mejor', 'mensual', 'TD'),
  ('recaudo_total',       'Total recaudo', 'Dinero efectivamente cobrado en el mes',
     'Recaudo por entidad + Recaudo por medio de pago', 'cop', 'mayor_mejor', 'mensual', 'TD › RECAUDO'),
  ('eficiencia_recaudo',  'Eficiencia de recaudo', 'Qué parte de lo facturado se cobró',
     'Recaudo por entidad ÷ Ingresos', 'pct', 'mayor_mejor', 'mensual', 'TD'),
  ('pagos',               'Pagos', 'Dinero que salió en el mes',
     'Suma sección PAGOS del mes', 'cop', 'menor_mejor', 'mensual', 'TD › PAGOS'),
  ('flujo_neto',          'Flujo neto de caja operativo', 'Lo que queda entre lo cobrado y lo pagado',
     'Total recaudo − Pagos', 'cop', 'mayor_mejor', 'mensual', 'TD'),
  ('cartera_total',       'Cartera total', 'Lo que los clientes deben al cierre del mes',
     'Suma hoja cartera del mes', 'cop', 'menor_mejor', 'mensual', 'cartera'),
  ('var_cartera',         'Variación mensual de cartera', 'Cuánto cambió la cartera frente al mes anterior',
     '(Cartera mes ÷ Cartera mes anterior) − 1', 'pct', 'menor_mejor', 'mensual', 'cartera'),
  ('concentracion_top5',  'Concentración de cartera top 5', 'Qué parte de la cartera deben los 5 mayores deudores',
     'Cartera 5 mayores entidades ÷ Cartera total', 'pct', 'menor_mejor', 'mensual', 'cartera'),
  ('personal_ingresos',   'Ingresos de personal', 'Personas contratadas en el mes',
     'Suma bloque ingresos TD ING RET', 'personas', 'neutro', 'mensual', 'TD ING RET'),
  ('personal_retiros',    'Retiros de personal', 'Personas que salieron en el mes',
     'Suma bloque retiros TD ING RET', 'personas', 'menor_mejor', 'mensual', 'TD ING RET');
