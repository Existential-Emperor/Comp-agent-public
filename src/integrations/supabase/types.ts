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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_traces: {
        Row: {
          agent_source: string
          category: string
          competitor_id: string | null
          competitor_name: string | null
          completion_tokens: number | null
          created_at: string
          error_message: string | null
          feedback_comment: string | null
          feedback_vote: string | null
          formatted_output: string | null
          id: string
          judge_scores: Json | null
          latency_ms: number | null
          message_id: string | null
          metadata: Json | null
          model_used: string | null
          overall_score: number | null
          prompt_tokens: number | null
          raw_llm_output: string | null
          retrieved_documents: Json | null
          status: string
          sub_category: string
          system_prompt: string | null
          thread_id: string | null
          tool_calls: Json | null
          total_tokens: number | null
          trace_type: string
          updated_at: string
          user_id: string
          user_prompt: string | null
        }
        Insert: {
          agent_source?: string
          category: string
          competitor_id?: string | null
          competitor_name?: string | null
          completion_tokens?: number | null
          created_at?: string
          error_message?: string | null
          feedback_comment?: string | null
          feedback_vote?: string | null
          formatted_output?: string | null
          id?: string
          judge_scores?: Json | null
          latency_ms?: number | null
          message_id?: string | null
          metadata?: Json | null
          model_used?: string | null
          overall_score?: number | null
          prompt_tokens?: number | null
          raw_llm_output?: string | null
          retrieved_documents?: Json | null
          status?: string
          sub_category: string
          system_prompt?: string | null
          thread_id?: string | null
          tool_calls?: Json | null
          total_tokens?: number | null
          trace_type?: string
          updated_at?: string
          user_id: string
          user_prompt?: string | null
        }
        Update: {
          agent_source?: string
          category?: string
          competitor_id?: string | null
          competitor_name?: string | null
          completion_tokens?: number | null
          created_at?: string
          error_message?: string | null
          feedback_comment?: string | null
          feedback_vote?: string | null
          formatted_output?: string | null
          id?: string
          judge_scores?: Json | null
          latency_ms?: number | null
          message_id?: string | null
          metadata?: Json | null
          model_used?: string | null
          overall_score?: number | null
          prompt_tokens?: number | null
          raw_llm_output?: string | null
          retrieved_documents?: Json | null
          status?: string
          sub_category?: string
          system_prompt?: string | null
          thread_id?: string | null
          tool_calls?: Json | null
          total_tokens?: number | null
          trace_type?: string
          updated_at?: string
          user_id?: string
          user_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_traces_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_traces_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_events: {
        Row: {
          created_at: string
          edge_function: string | null
          error_message: string | null
          event_type: string
          http_status: number | null
          id: string
          key_name: string
          metadata: Json | null
          notified: boolean
          service: string
        }
        Insert: {
          created_at?: string
          edge_function?: string | null
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          key_name: string
          metadata?: Json | null
          notified?: boolean
          service: string
        }
        Update: {
          created_at?: string
          edge_function?: string | null
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          key_name?: string
          metadata?: Json | null
          notified?: boolean
          service?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          category: string
          competitor_id: string | null
          competitor_name: string | null
          created_at: string
          id: string
          is_archived: boolean
          sub_category: string
          summary: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          sub_category: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          sub_category?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_pages: {
        Row: {
          competitor_name: string
          content_hash: string | null
          content_summary: string | null
          content_updated_at: string | null
          crawl_status: string
          created_at: string
          error_message: string | null
          id: string
          last_crawled_at: string
          metadata: Json | null
          page_type: string
          page_url: string
          raw_content: string | null
          screenshot_urls: string[] | null
          title: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          competitor_name: string
          content_hash?: string | null
          content_summary?: string | null
          content_updated_at?: string | null
          crawl_status?: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_crawled_at?: string
          metadata?: Json | null
          page_type?: string
          page_url: string
          raw_content?: string | null
          screenshot_urls?: string[] | null
          title?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          competitor_name?: string
          content_hash?: string | null
          content_summary?: string | null
          content_updated_at?: string | null
          crawl_status?: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_crawled_at?: string
          metadata?: Json | null
          page_type?: string
          page_url?: string
          raw_content?: string | null
          screenshot_urls?: string[] | null
          title?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: []
      }
      competitors: {
        Row: {
          category: string
          created_at: string
          description: string | null
          discovered_by: string | null
          id: string
          is_seed: boolean
          metadata: Json | null
          name: string
          sub_category: string
          updated_at: string
          website: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          discovered_by?: string | null
          id?: string
          is_seed?: boolean
          metadata?: Json | null
          name: string
          sub_category: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          discovered_by?: string | null
          id?: string
          is_seed?: boolean
          metadata?: Json | null
          name?: string
          sub_category?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      crawler_runs: {
        Row: {
          competitors_processed: number | null
          completed_at: string | null
          errors: string[] | null
          id: string
          metadata: Json | null
          pages_crawled: number | null
          pages_updated: number | null
          run_type: string
          screenshots_taken: number | null
          started_at: string
          status: string
        }
        Insert: {
          competitors_processed?: number | null
          completed_at?: string | null
          errors?: string[] | null
          id?: string
          metadata?: Json | null
          pages_crawled?: number | null
          pages_updated?: number | null
          run_type?: string
          screenshots_taken?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          competitors_processed?: number | null
          completed_at?: string | null
          errors?: string[] | null
          id?: string
          metadata?: Json | null
          pages_crawled?: number | null
          pages_updated?: number | null
          run_type?: string
          screenshots_taken?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      evaluation_scores: {
        Row: {
          category: string
          citation_coverage: number | null
          competitor_name: string
          created_at: string
          depth_of_comparison: number | null
          factual_correctness: number | null
          id: string
          message_id: string | null
          overall_score: number | null
          structural_clarity: number | null
          sub_category: string
          user_id: string
          visual_evidence: number | null
        }
        Insert: {
          category: string
          citation_coverage?: number | null
          competitor_name: string
          created_at?: string
          depth_of_comparison?: number | null
          factual_correctness?: number | null
          id?: string
          message_id?: string | null
          overall_score?: number | null
          structural_clarity?: number | null
          sub_category: string
          user_id: string
          visual_evidence?: number | null
        }
        Update: {
          category?: string
          citation_coverage?: number | null
          competitor_name?: string
          created_at?: string
          depth_of_comparison?: number | null
          factual_correctness?: number | null
          id?: string
          message_id?: string | null
          overall_score?: number | null
          structural_clarity?: number | null
          sub_category?: string
          user_id?: string
          visual_evidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          captured_at: string
          cdn_url: string | null
          competitor_name: string
          created_at: string
          file_size_bytes: number | null
          id: string
          is_active: boolean
          last_refreshed_at: string
          media_type: string
          metadata: Json | null
          page_url: string
          product_area: string
          product_sub_area: string
          source_type: string
          storage_url: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          captured_at?: string
          cdn_url?: string | null
          competitor_name: string
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string
          media_type?: string
          metadata?: Json | null
          page_url: string
          product_area: string
          product_sub_area: string
          source_type?: string
          storage_url: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          captured_at?: string
          cdn_url?: string | null
          competitor_name?: string
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string
          media_type?: string
          metadata?: Json | null
          page_url?: string
          product_area?: string
          product_sub_area?: string
          source_type?: string
          storage_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          created_at: string
          fetched_at: string
          id: string
          image_url: string | null
          item_type: string
          metadata: Json | null
          published_at: string | null
          source_name: string | null
          source_url: string
          summary: string | null
          title: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          id?: string
          image_url?: string | null
          item_type?: string
          metadata?: Json | null
          published_at?: string | null
          source_name?: string | null
          source_url: string
          summary?: string | null
          title: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: string
          image_url?: string | null
          item_type?: string
          metadata?: Json | null
          published_at?: string | null
          source_name?: string | null
          source_url?: string
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          metadata: Json | null
          subscribed_at: string
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          metadata?: Json | null
          subscribed_at?: string
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          metadata?: Json | null
          subscribed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_items: {
        Row: {
          id: string
          news_item_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          id?: string
          news_item_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          id?: string
          news_item_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validated_responses: {
        Row: {
          category: string
          competitor_id: string | null
          competitor_name: string
          created_at: string
          feedback: string | null
          id: string
          metadata: Json | null
          response_content: string
          sub_category: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          competitor_id?: string | null
          competitor_name: string
          created_at?: string
          feedback?: string | null
          id?: string
          metadata?: Json | null
          response_content: string
          sub_category: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          competitor_id?: string | null
          competitor_name?: string
          created_at?: string
          feedback?: string | null
          id?: string
          metadata?: Json | null
          response_content?: string
          sub_category?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validated_responses_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
