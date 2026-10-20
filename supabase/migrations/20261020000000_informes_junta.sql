-- =====================================================================
-- Informe mensual para la Junta Directiva (feedback del analista, sept. 2026)
-- Un borrador por empresa y periodo. Las secciones automáticas las arma el
-- servidor con KPI calculados; la IA solo redacta resumen y alertas; el
-- gerente escribe los bloques cualitativos.
-- =====================================================================

create type estado_informe as enum ('borrador', 'aprobado');

create table informes_junta (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresas(id),
  periodo            date not null check (extract(day from periodo) = 1),
  estado             estado_informe not null default 'borrador',
  -- Secciones automáticas (snapshot trazable: cada cifra referencia kpi_resultados/cargas)
  datos              jsonb not null default '{}'::jsonb,   -- tablero, caja, cartera, semáforos, origen
  resumen_ia         text,                                  -- Sección 1 (redacta la IA)
  alertas_ia         jsonb not null default '[]'::jsonb,    -- Sección 5: [{indicador, estado, texto}]
  modelo_ia          text,
  -- Bloques del gerente
  causas_acciones    text,
  hechos_relevantes  text,
  decisiones_junta   text,
  compromisos        text,
  -- Trazabilidad
  generado_en        timestamptz not null default now(),
  generado_por       uuid references perfiles(id),         -- null = generado automáticamente al aceptar la carga
  actualizado_en     timestamptz not null default now(),
  aprobado_en        timestamptz,
  aprobado_por       uuid references perfiles(id),
  unique (empresa_id, periodo)
);

alter table informes_junta enable row level security;

-- Lectura bajo el mismo permiso que el resto de datos de la empresa. Escritura solo desde el servidor.
create policy leer_informes_junta on informes_junta for select to authenticated
  using (puede_ver_empresa(empresa_id));
