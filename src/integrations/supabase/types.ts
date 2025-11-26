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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      design_submissions: {
        Row: {
          designer_id: string
          file_name: string
          file_path: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision_notes: string | null
          revision_reference_file_name: string | null
          revision_reference_file_path: string | null
          revision_status: string | null
          submitted_at: string | null
          task_id: string
        }
        Insert: {
          designer_id: string
          file_name: string
          file_path: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_notes?: string | null
          revision_reference_file_name?: string | null
          revision_reference_file_path?: string | null
          revision_status?: string | null
          submitted_at?: string | null
          task_id: string
        }
        Update: {
          designer_id?: string
          file_name?: string
          file_path?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_notes?: string | null
          revision_reference_file_name?: string | null
          revision_reference_file_path?: string | null
          revision_status?: string | null
          submitted_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_submissions_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          additional_details: string | null
          attachment_file_name: string | null
          attachment_file_path: string | null
          brand_colors: string | null
          business_name: string | null
          competitors_inspiration: string | null
          created_at: string | null
          cta: string | null
          deadline: string | null
          description: string | null
          design_style: string | null
          file_formats_needed: string | null
          fonts: string | null
          headline_main_text: string | null
          id: string
          industry: string | null
          logo_style: string | null
          logo_type: string | null
          logo_url: string | null
          notes_extra_instructions: string | null
          number_of_concepts: string | null
          number_of_revisions: string | null
          objective: string | null
          platforms: string[] | null
          post_type: string | null
          post_type_required: string | null
          pricing: string | null
          product_service_description: string | null
          product_service_images: string | null
          product_service_name: string | null
          project_manager_id: string
          status: Database["public"]["Enums"]["task_status"]
          supporting_text: string | null
          tagline: string | null
          target_audience_age: string | null
          target_audience_interest: string | null
          target_audience_location: string | null
          target_audience_other: string | null
          task_number: number
          team_id: string
          title: string
          updated_at: string | null
          usage_type: string | null
          website_url: string | null
        }
        Insert: {
          additional_details?: string | null
          attachment_file_name?: string | null
          attachment_file_path?: string | null
          brand_colors?: string | null
          business_name?: string | null
          competitors_inspiration?: string | null
          created_at?: string | null
          cta?: string | null
          deadline?: string | null
          description?: string | null
          design_style?: string | null
          file_formats_needed?: string | null
          fonts?: string | null
          headline_main_text?: string | null
          id?: string
          industry?: string | null
          logo_style?: string | null
          logo_type?: string | null
          logo_url?: string | null
          notes_extra_instructions?: string | null
          number_of_concepts?: string | null
          number_of_revisions?: string | null
          objective?: string | null
          platforms?: string[] | null
          post_type?: string | null
          post_type_required?: string | null
          pricing?: string | null
          product_service_description?: string | null
          product_service_images?: string | null
          product_service_name?: string | null
          project_manager_id: string
          status?: Database["public"]["Enums"]["task_status"]
          supporting_text?: string | null
          tagline?: string | null
          target_audience_age?: string | null
          target_audience_interest?: string | null
          target_audience_location?: string | null
          target_audience_other?: string | null
          task_number?: number
          team_id: string
          title: string
          updated_at?: string | null
          usage_type?: string | null
          website_url?: string | null
        }
        Update: {
          additional_details?: string | null
          attachment_file_name?: string | null
          attachment_file_path?: string | null
          brand_colors?: string | null
          business_name?: string | null
          competitors_inspiration?: string | null
          created_at?: string | null
          cta?: string | null
          deadline?: string | null
          description?: string | null
          design_style?: string | null
          file_formats_needed?: string | null
          fonts?: string | null
          headline_main_text?: string | null
          id?: string
          industry?: string | null
          logo_style?: string | null
          logo_type?: string | null
          logo_url?: string | null
          notes_extra_instructions?: string | null
          number_of_concepts?: string | null
          number_of_revisions?: string | null
          objective?: string | null
          platforms?: string[] | null
          post_type?: string | null
          post_type_required?: string | null
          pricing?: string | null
          product_service_description?: string | null
          product_service_images?: string | null
          product_service_name?: string | null
          project_manager_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          supporting_text?: string | null
          tagline?: string | null
          target_audience_age?: string | null
          target_audience_interest?: string | null
          target_audience_location?: string | null
          target_audience_other?: string | null
          task_number?: number
          team_id?: string
          title?: string
          updated_at?: string | null
          usage_type?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_user_role: {
        Args: {
          role_name: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_user_role_designer: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "project_manager" | "designer"
      task_status: "pending" | "in_progress" | "completed" | "approved"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "project_manager", "designer"],
      task_status: ["pending", "in_progress", "completed", "approved"],
    },
  },
} as const
