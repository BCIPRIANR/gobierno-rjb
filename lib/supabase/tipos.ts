export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          accion: string
          creado_en: string
          detalle: Json
          entidad: string | null
          entidad_id: string | null
          id: number
          usuario_id: string | null
        }
        Insert: {
          accion: string
          creado_en?: string
          detalle?: Json
          entidad?: string | null
          entidad_id?: string | null
          id?: never
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          creado_en?: string
          detalle?: Json
          entidad?: string | null
          entidad_id?: string | null
          id?: never
          usuario_id?: string | null
        }
        Relationships: []
      }
      cargas: {
        Row: {
          caracter: Database["public"]["Enums"]["caracter_carga"]
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_carga"]
          hash_sha256: string
          id: string
          motivo_rechazo: string | null
          nombre_archivo: string
          periodo: string
          resultado_checks: Json
          storage_path: string
          subido_en: string
          subido_por: string
          tipo_archivo: string
          version: number
          vigente: boolean
        }
        Insert: {
          caracter?: Database["public"]["Enums"]["caracter_carga"]
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_carga"]
          hash_sha256: string
          id?: string
          motivo_rechazo?: string | null
          nombre_archivo: string
          periodo: string
          resultado_checks?: Json
          storage_path: string
          subido_en?: string
          subido_por: string
          tipo_archivo: string
          version?: number
          vigente?: boolean
        }
        Update: {
          caracter?: Database["public"]["Enums"]["caracter_carga"]
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_carga"]
          hash_sha256?: string
          id?: string
          motivo_rechazo?: string | null
          nombre_archivo?: string
          periodo?: string
          resultado_checks?: Json
          storage_path?: string
          subido_en?: string
          subido_por?: string
          tipo_archivo?: string
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cargas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_tipo_archivo_fkey"
            columns: ["tipo_archivo"]
            isOneToOne: false
            referencedRelation: "tipos_archivo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      chat_mensajes: {
        Row: {
          canal: string
          contenido: string
          conversacion_id: string
          creado_en: string
          id: number
          metadatos: Json
          rol: string
          usuario_id: string
        }
        Insert: {
          canal?: string
          contenido: string
          conversacion_id: string
          creado_en?: string
          id?: never
          metadatos?: Json
          rol: string
          usuario_id: string
        }
        Update: {
          canal?: string
          contenido?: string
          conversacion_id?: string
          creado_en?: string
          id?: never
          metadatos?: Json
          rol?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensajes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          activa: boolean
          creado_en: string
          es_demo: boolean
          id: string
          nit: string | null
          nombre: string
          slug: string
        }
        Insert: {
          activa?: boolean
          creado_en?: string
          es_demo?: boolean
          id?: string
          nit?: string | null
          nombre: string
          slug: string
        }
        Update: {
          activa?: boolean
          creado_en?: string
          es_demo?: boolean
          id?: string
          nit?: string | null
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      hechos_financieros: {
        Row: {
          carga_id: string
          columna_origen: string | null
          concepto: string
          empresa_id: string
          fila_origen: number | null
          hoja_origen: string
          id: number
          periodo: string
          seccion: string
          tercero_id: string | null
          unidad: string
          valor: number
        }
        Insert: {
          carga_id: string
          columna_origen?: string | null
          concepto: string
          empresa_id: string
          fila_origen?: number | null
          hoja_origen: string
          id?: never
          periodo: string
          seccion: string
          tercero_id?: string | null
          unidad?: string
          valor: number
        }
        Update: {
          carga_id?: string
          columna_origen?: string | null
          concepto?: string
          empresa_id?: string
          fila_origen?: number | null
          hoja_origen?: string
          id?: never
          periodo?: string
          seccion?: string
          tercero_id?: string | null
          unidad?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "hechos_financieros_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hechos_financieros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hechos_financieros_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hechos_financieros_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_terceros_compartidos"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      informes_junta: {
        Row: {
          actualizado_en: string
          alertas_ia: Json
          aprobado_en: string | null
          aprobado_por: string | null
          causas_acciones: string | null
          compromisos: string | null
          datos: Json
          decisiones_junta: string | null
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_informe"]
          generado_en: string
          generado_por: string | null
          hechos_relevantes: string | null
          id: string
          modelo_ia: string | null
          periodo: string
          resumen_ia: string | null
        }
        Insert: {
          actualizado_en?: string
          alertas_ia?: Json
          aprobado_en?: string | null
          aprobado_por?: string | null
          causas_acciones?: string | null
          compromisos?: string | null
          datos?: Json
          decisiones_junta?: string | null
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_informe"]
          generado_en?: string
          generado_por?: string | null
          hechos_relevantes?: string | null
          id?: string
          modelo_ia?: string | null
          periodo: string
          resumen_ia?: string | null
        }
        Update: {
          actualizado_en?: string
          alertas_ia?: Json
          aprobado_en?: string | null
          aprobado_por?: string | null
          causas_acciones?: string | null
          compromisos?: string | null
          datos?: Json
          decisiones_junta?: string | null
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_informe"]
          generado_en?: string
          generado_por?: string | null
          hechos_relevantes?: string | null
          id?: string
          modelo_ia?: string | null
          periodo?: string
          resumen_ia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "informes_junta_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_junta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_junta_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definiciones: {
        Row: {
          activo: boolean
          codigo: string
          definicion: string
          formula_texto: string
          fuente: string
          nombre: string
          periodicidad: Database["public"]["Enums"]["periodicidad"]
          sentido: string
          umbral_alerta: number | null
          umbral_ok: number | null
          unidad: string
          version: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          definicion: string
          formula_texto: string
          fuente: string
          nombre: string
          periodicidad: Database["public"]["Enums"]["periodicidad"]
          sentido: string
          umbral_alerta?: number | null
          umbral_ok?: number | null
          unidad: string
          version?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          definicion?: string
          formula_texto?: string
          fuente?: string
          nombre?: string
          periodicidad?: Database["public"]["Enums"]["periodicidad"]
          sentido?: string
          umbral_alerta?: number | null
          umbral_ok?: number | null
          unidad?: string
          version?: number
        }
        Relationships: []
      }
      kpi_resultados: {
        Row: {
          calculado_en: string
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_dato"]
          formula_version: number
          id: number
          insumos: Json
          kpi_codigo: string
          motivo_nd: string | null
          periodo: string
          valor: number | null
        }
        Insert: {
          calculado_en?: string
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_dato"]
          formula_version: number
          id?: never
          insumos?: Json
          kpi_codigo: string
          motivo_nd?: string | null
          periodo: string
          valor?: number | null
        }
        Update: {
          calculado_en?: string
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_dato"]
          formula_version?: number
          id?: never
          insumos?: Json
          kpi_codigo?: string
          motivo_nd?: string | null
          periodo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_resultados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_resultados_kpi_codigo_fkey"
            columns: ["kpi_codigo"]
            isOneToOne: false
            referencedRelation: "kpi_definiciones"
            referencedColumns: ["codigo"]
          },
        ]
      }
      metas: {
        Row: {
          aprobada: boolean
          definida_por: string | null
          empresa_id: string
          kpi_codigo: string
          nota: string | null
          periodo: string
          valor: number
        }
        Insert: {
          aprobada?: boolean
          definida_por?: string | null
          empresa_id: string
          kpi_codigo: string
          nota?: string | null
          periodo: string
          valor: number
        }
        Update: {
          aprobada?: boolean
          definida_por?: string | null
          empresa_id?: string
          kpi_codigo?: string
          nota?: string | null
          periodo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_definida_por_fkey"
            columns: ["definida_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_kpi_codigo_fkey"
            columns: ["kpi_codigo"]
            isOneToOne: false
            referencedRelation: "kpi_definiciones"
            referencedColumns: ["codigo"]
          },
        ]
      }
      notificaciones: {
        Row: {
          asunto: string | null
          canal: string
          creado_en: string
          cuerpo: string
          destinatario_id: string
          empresa_id: string | null
          enviado_en: string | null
          error: string | null
          estado: string
          id: string
          tipo: string
        }
        Insert: {
          asunto?: string | null
          canal: string
          creado_en?: string
          cuerpo: string
          destinatario_id: string
          empresa_id?: string | null
          enviado_en?: string | null
          error?: string | null
          estado?: string
          id?: string
          tipo: string
        }
        Update: {
          asunto?: string | null
          canal?: string
          creado_en?: string
          cuerpo?: string
          destinatario_id?: string
          empresa_id?: string | null
          enviado_en?: string | null
          error?: string | null
          estado?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          creado_en: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono_whatsapp: string | null
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono_whatsapp?: string | null
        }
        Update: {
          activo?: boolean
          creado_en?: string
          email?: string
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono_whatsapp?: string | null
        }
        Relationships: []
      }
      terceros: {
        Row: {
          creado_en: string
          id: string
          nit: string
          razon_social: string
          tipo: string
        }
        Insert: {
          creado_en?: string
          id?: string
          nit: string
          razon_social: string
          tipo?: string
        }
        Update: {
          creado_en?: string
          id?: string
          nit?: string
          razon_social?: string
          tipo?: string
        }
        Relationships: []
      }
      tipos_archivo: {
        Row: {
          codigo: string
          descripcion: string | null
          dia_limite: number
          nombre: string
          obligatorio: boolean
          periodicidad: Database["public"]["Enums"]["periodicidad"]
        }
        Insert: {
          codigo: string
          descripcion?: string | null
          dia_limite: number
          nombre: string
          obligatorio?: boolean
          periodicidad: Database["public"]["Enums"]["periodicidad"]
        }
        Update: {
          codigo?: string
          descripcion?: string | null
          dia_limite?: number
          nombre?: string
          obligatorio?: boolean
          periodicidad?: Database["public"]["Enums"]["periodicidad"]
        }
        Relationships: []
      }
      usuario_empresa: {
        Row: {
          empresa_id: string
          usuario_id: string
        }
        Insert: {
          empresa_id: string
          usuario_id: string
        }
        Update: {
          empresa_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_empresa_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_terceros_compartidos: {
        Row: {
          empresas: string[] | null
          incluye_demo: boolean | null
          nit: string | null
          num_empresas: number | null
          periodo: string | null
          razon_social: string | null
          seccion: string | null
          tercero_id: string | null
          tipo: string | null
          valor_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      puede_cargar: {
        Args: { p_empresa: string; p_usuario: string }
        Returns: boolean
      }
      puede_ver_empresa: { Args: { p_empresa: string }; Returns: boolean }
      rol_actual: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      semaforo_cargas: {
        Args: { p_periodo: string }
        Returns: {
          caracter: Database["public"]["Enums"]["caracter_carga"]
          dias_atraso: number
          empresa: string
          empresa_id: string
          es_demo: boolean
          estado: string
          fecha_limite: string
          tipo_archivo: string
          ultima_carga: string
        }[]
      }
      ve_todo: { Args: never; Returns: boolean }
    }
    Enums: {
      caracter_carga: "preliminar" | "definitivo"
      estado_carga: "procesando" | "aceptada" | "rechazada"
      estado_dato: "real" | "calculado" | "meta" | "nd"
      estado_informe: "borrador" | "aprobado"
      periodicidad: "mensual" | "anual"
      rol_usuario: "founder" | "admin" | "gerente" | "contador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      caracter_carga: ["preliminar", "definitivo"],
      estado_carga: ["procesando", "aceptada", "rechazada"],
      estado_dato: ["real", "calculado", "meta", "nd"],
      estado_informe: ["borrador", "aprobado"],
      periodicidad: ["mensual", "anual"],
      rol_usuario: ["founder", "admin", "gerente", "contador"],
    },
  },
} as const
