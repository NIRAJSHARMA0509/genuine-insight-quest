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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      interview_sessions: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          full_transcript: Json | null
          id: string
          organisation_id: string | null
          previous_attempts_summary: Json | null
          proctoring_flags: Json | null
          score_report: Json | null
          started_at: string | null
          status: string
          student_email: string | null
          student_name: string | null
          student_reference: string | null
          test_id: string | null
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          full_transcript?: Json | null
          id?: string
          organisation_id?: string | null
          previous_attempts_summary?: Json | null
          proctoring_flags?: Json | null
          score_report?: Json | null
          started_at?: string | null
          status?: string
          student_email?: string | null
          student_name?: string | null
          student_reference?: string | null
          test_id?: string | null
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          full_transcript?: Json | null
          id?: string
          organisation_id?: string | null
          previous_attempts_summary?: Json | null
          proctoring_flags?: Json | null
          score_report?: Json | null
          started_at?: string | null
          status?: string
          student_email?: string | null
          student_name?: string | null
          student_reference?: string | null
          test_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_criteria: {
        Row: {
          created_at: string
          criterion: string
          id: string
          objective_id: string
          order_index: number
          score: number
        }
        Insert: {
          created_at?: string
          criterion: string
          id?: string
          objective_id: string
          order_index?: number
          score: number
        }
        Update: {
          created_at?: string
          criterion?: string
          id?: string
          objective_id?: string
          order_index?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "objective_criteria_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          created_at: string
          description: string | null
          id: string
          level_id: string
          order_index: number
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          level_id: string
          order_index?: number
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          level_id?: string
          order_index?: number
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "objectives_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "test_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          contact_email: string | null
          created_at: string
          custom_urls: Json
          description: string | null
          id: string
          intake_year: string | null
          logo_url: string | null
          name: string
          nature_of_service: string | null
          programme_name: string | null
          type: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          custom_urls?: Json
          description?: string | null
          id?: string
          intake_year?: string | null
          logo_url?: string | null
          name: string
          nature_of_service?: string | null
          programme_name?: string | null
          type: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          custom_urls?: Json
          description?: string | null
          id?: string
          intake_year?: string | null
          logo_url?: string | null
          name?: string
          nature_of_service?: string | null
          programme_name?: string | null
          type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      question_rubrics: {
        Row: {
          created_at: string
          example_response: string
          id: string
          order_index: number
          question_id: string
          score: number
        }
        Insert: {
          created_at?: string
          example_response: string
          id?: string
          order_index?: number
          question_id: string
          score: number
        }
        Update: {
          created_at?: string
          example_response?: string
          id?: string
          order_index?: number
          question_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_rubrics_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          ai_generated: boolean
          answer_time_seconds: number
          created_at: string
          id: string
          level_id: string
          max_follow_ups: number
          order_index: number
          question_text: string
          think_time_seconds: number
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          answer_time_seconds?: number
          created_at?: string
          id?: string
          level_id: string
          max_follow_ups?: number
          order_index?: number
          question_text: string
          think_time_seconds?: number
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          answer_time_seconds?: number
          created_at?: string
          id?: string
          level_id?: string
          max_follow_ups?: number
          order_index?: number
          question_text?: string
          think_time_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "test_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      test_levels: {
        Row: {
          ai_question_budget: number
          created_at: string
          id: string
          mode: string
          name: string
          order_index: number
          test_id: string
          updated_at: string
        }
        Insert: {
          ai_question_budget?: number
          created_at?: string
          id?: string
          mode: string
          name: string
          order_index?: number
          test_id: string
          updated_at?: string
        }
        Update: {
          ai_question_budget?: number
          created_at?: string
          id?: string
          mode?: string
          name?: string
          order_index?: number
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_levels_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          attempts_context_note: string | null
          closing_message: string | null
          closing_mode: string
          created_at: string
          id: string
          intro_message: string | null
          intro_mode: string
          max_attempts: number
          name: string
          organisation_id: string
          proctoring_enabled: boolean
          purpose: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts_context_note?: string | null
          closing_message?: string | null
          closing_mode?: string
          created_at?: string
          id?: string
          intro_message?: string | null
          intro_mode?: string
          max_attempts?: number
          name: string
          organisation_id: string
          proctoring_enabled?: boolean
          purpose?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts_context_note?: string | null
          closing_message?: string | null
          closing_mode?: string
          created_at?: string
          id?: string
          intro_message?: string | null
          intro_mode?: string
          max_attempts?: number
          name?: string
          organisation_id?: string
          proctoring_enabled?: boolean
          purpose?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
