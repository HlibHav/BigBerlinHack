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
      brief_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["brief_channel"]
          created_at: string
          delivery_date: string
          error_reason: string | null
          id: string
          organization_id: string
          recipient: string
          run_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["brief_status"]
          summary_body: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["brief_channel"]
          created_at?: string
          delivery_date: string
          error_reason?: string | null
          id?: string
          organization_id: string
          recipient: string
          run_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["brief_status"]
          summary_body: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["brief_channel"]
          created_at?: string
          delivery_date?: string
          error_reason?: string | null
          id?: string
          organization_id?: string
          recipient?: string
          run_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["brief_status"]
          summary_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      citations: {
        Row: {
          created_at: string
          embedding: string | null
          excerpt: string
          id: string
          organization_id: string
          snapshot_id: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          excerpt: string
          id?: string
          organization_id: string
          snapshot_id: string
          title: string
          url: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          excerpt?: string
          id?: string
          organization_id?: string
          snapshot_id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "citations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          display_name: string
          handles: Json
          homepage_url: string | null
          id: string
          is_active: boolean
          organization_id: string
          relationship: string
          search_terms: string[]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          handles?: Json
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          relationship?: string
          search_terms?: string[]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          handles?: Json
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          relationship?: string
          search_terms?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_variants: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["content_channel"]
          created_at: string
          evidence_refs: string[]
          id: string
          metadata: Json
          organization_id: string
          parent_counter_draft_id: string
          run_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["content_channel"]
          created_at?: string
          evidence_refs: string[]
          id?: string
          metadata?: Json
          organization_id: string
          parent_counter_draft_id: string
          run_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["content_channel"]
          created_at?: string
          evidence_refs?: string[]
          id?: string
          metadata?: Json
          organization_id?: string
          parent_counter_draft_id?: string
          run_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_variants_parent_counter_draft_id_fkey"
            columns: ["parent_counter_draft_id"]
            isOneToOne: false
            referencedRelation: "counter_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_ledger: {
        Row: {
          created_at: string
          id: string
          operation: string
          organization_id: string
          run_id: string | null
          service: Database["public"]["Enums"]["cost_service"]
          tokens_or_units: number | null
          usd_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          operation: string
          organization_id: string
          run_id?: string | null
          service: Database["public"]["Enums"]["cost_service"]
          tokens_or_units?: number | null
          usd_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          operation?: string
          organization_id?: string
          run_id?: string | null
          service?: Database["public"]["Enums"]["cost_service"]
          tokens_or_units?: number | null
          usd_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_drafts: {
        Row: {
          body: string
          channel_hint: Database["public"]["Enums"]["counter_draft_channel"]
          created_at: string
          evidence_refs: string[]
          id: string
          organization_id: string
          published_at: string | null
          reasoning: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_variant_id: string | null
          signal_id: string | null
          status: Database["public"]["Enums"]["counter_draft_status"]
          tone_pillar: string
          updated_at: string | null
        }
        Insert: {
          body: string
          channel_hint: Database["public"]["Enums"]["counter_draft_channel"]
          created_at?: string
          evidence_refs: string[]
          id?: string
          organization_id: string
          published_at?: string | null
          reasoning: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_variant_id?: string | null
          signal_id?: string | null
          status?: Database["public"]["Enums"]["counter_draft_status"]
          tone_pillar: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          channel_hint?: Database["public"]["Enums"]["counter_draft_channel"]
          created_at?: string
          evidence_refs?: string[]
          id?: string
          organization_id?: string
          published_at?: string | null
          reasoning?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_variant_id?: string | null
          signal_id?: string | null
          status?: Database["public"]["Enums"]["counter_draft_status"]
          tone_pillar?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counter_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_drafts_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_variants: {
        Row: {
          avg_position: number | null
          body: string
          created_at: string
          evidence_refs: string[]
          id: string
          mention_rate: number
          metadata: Json
          organization_id: string
          predicted_sentiment: Database["public"]["Enums"]["sentiment_label"]
          rank: number
          score: number
          score_reasoning: string
          seed_counter_draft_id: string | null
          seed_signal_id: string | null
          simulator_run_id: string
        }
        Insert: {
          avg_position?: number | null
          body: string
          created_at?: string
          evidence_refs: string[]
          id?: string
          mention_rate: number
          metadata?: Json
          organization_id: string
          predicted_sentiment: Database["public"]["Enums"]["sentiment_label"]
          rank: number
          score: number
          score_reasoning: string
          seed_counter_draft_id?: string | null
          seed_signal_id?: string | null
          simulator_run_id: string
        }
        Update: {
          avg_position?: number | null
          body?: string
          created_at?: string
          evidence_refs?: string[]
          id?: string
          mention_rate?: number
          metadata?: Json
          organization_id?: string
          predicted_sentiment?: Database["public"]["Enums"]["sentiment_label"]
          rank?: number
          score?: number
          score_reasoning?: string
          seed_counter_draft_id?: string | null
          seed_signal_id?: string | null
          simulator_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_variants_seed_counter_draft_id_fkey"
            columns: ["seed_counter_draft_id"]
            isOneToOne: false
            referencedRelation: "counter_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_variants_seed_signal_id_fkey"
            columns: ["seed_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_variants_simulator_run_id_fkey"
            columns: ["simulator_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      narratives: {
        Row: {
          citation_ids: string[]
          created_at: string
          embedding: string | null
          generated_at: string
          highlighted_themes: string[]
          id: string
          is_public: boolean
          organization_id: string
          summary_markdown: string
        }
        Insert: {
          citation_ids: string[]
          created_at?: string
          embedding?: string | null
          generated_at?: string
          highlighted_themes: string[]
          id?: string
          is_public?: boolean
          organization_id: string
          summary_markdown: string
        }
        Update: {
          citation_ids?: string[]
          created_at?: string
          embedding?: string | null
          generated_at?: string
          highlighted_themes?: string[]
          id?: string
          is_public?: boolean
          organization_id?: string
          summary_markdown?: string
        }
        Relationships: [
          {
            foreignKeyName: "narratives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      // W11 podcast-prep — manually patched (types:gen blocked by pre-existing
      // seed.sql duplicate-signals bug). Mirror migration
      // supabase/migrations/20260426070000_create_podcast_briefs.sql exactly.
      // Re-run `pnpm types:gen` once seed bug is fixed to regenerate this block.
      podcast_briefs: {
        Row: {
          anticipated_qa: Json
          audience: string
          brand_drop_moments: Json
          competitor_mention_strategy: Json
          created_at: string
          episode_topic: string
          host_name: string
          id: string
          judge_dimensions: Json | null
          judge_reasoning: string | null
          judge_score: number | null
          markdown_brief: string
          metadata: Json
          organization_id: string
          podcast_name: string
          previous_episode_urls: Json
          requested_by: string | null
          scheduled_date: string | null
          simulator_run_id: string | null
          talking_points: Json
          top_fixes: Json
          topics_to_avoid: Json
          updated_at: string | null
        }
        Insert: {
          anticipated_qa?: Json
          audience: string
          brand_drop_moments?: Json
          competitor_mention_strategy?: Json
          created_at?: string
          episode_topic: string
          host_name: string
          id?: string
          judge_dimensions?: Json | null
          judge_reasoning?: string | null
          judge_score?: number | null
          markdown_brief?: string
          metadata?: Json
          organization_id: string
          podcast_name: string
          previous_episode_urls?: Json
          requested_by?: string | null
          scheduled_date?: string | null
          simulator_run_id?: string | null
          talking_points?: Json
          top_fixes?: Json
          topics_to_avoid?: Json
          updated_at?: string | null
        }
        Update: {
          anticipated_qa?: Json
          audience?: string
          brand_drop_moments?: Json
          competitor_mention_strategy?: Json
          created_at?: string
          episode_topic?: string
          host_name?: string
          id?: string
          judge_dimensions?: Json | null
          judge_reasoning?: string | null
          judge_score?: number | null
          markdown_brief?: string
          metadata?: Json
          organization_id?: string
          podcast_name?: string
          previous_episode_urls?: Json
          requested_by?: string | null
          scheduled_date?: string | null
          simulator_run_id?: string | null
          talking_points?: Json
          top_fixes?: Json
          topics_to_avoid?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "podcast_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_briefs_simulator_run_id_fkey"
            columns: ["simulator_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      prelaunch_checks: {
        Row: {
          baseline: Json
          brand_slug: string
          category_hint: string | null
          cost_usd_cents: number
          created_at: string
          created_by: string | null
          draft_phrasing: string
          evidence_refs: string[]
          id: string
          llm_panel_results: Json
          organization_id: string
          phrase_availability: Json
          run_id: string | null
          verdict: Database["public"]["Enums"]["prelaunch_verdict"]
          verdict_reasoning: string
        }
        Insert: {
          baseline: Json
          brand_slug: string
          category_hint?: string | null
          cost_usd_cents?: number
          created_at?: string
          created_by?: string | null
          draft_phrasing: string
          evidence_refs?: string[]
          id?: string
          llm_panel_results: Json
          organization_id: string
          phrase_availability: Json
          run_id?: string | null
          verdict: Database["public"]["Enums"]["prelaunch_verdict"]
          verdict_reasoning: string
        }
        Update: {
          baseline?: Json
          brand_slug?: string
          category_hint?: string | null
          cost_usd_cents?: number
          created_at?: string
          created_by?: string | null
          draft_phrasing?: string
          evidence_refs?: string[]
          id?: string
          llm_panel_results?: Json
          organization_id?: string
          phrase_availability?: Json
          run_id?: string | null
          verdict?: Database["public"]["Enums"]["prelaunch_verdict"]
          verdict_reasoning?: string
        }
        Relationships: [
          {
            foreignKeyName: "prelaunch_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prelaunch_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_public_demo: boolean
          local_timezone: string
          slug: string
          updated_at: string | null
          voice_call_preference: Database["public"]["Enums"]["voice_preference"]
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_public_demo?: boolean
          local_timezone?: string
          slug: string
          updated_at?: string | null
          voice_call_preference?: Database["public"]["Enums"]["voice_preference"]
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_public_demo?: boolean
          local_timezone?: string
          slug?: string
          updated_at?: string | null
          voice_call_preference?: Database["public"]["Enums"]["voice_preference"]
        }
        Relationships: []
      }
      runs: {
        Row: {
          created_at: string
          event_payload: Json
          finished_at: string | null
          function_name: string
          id: string
          ok: boolean
          organization_id: string
          reason: string | null
          started_at: string
          stats: Json | null
        }
        Insert: {
          created_at?: string
          event_payload: Json
          finished_at?: string | null
          function_name: string
          id?: string
          ok: boolean
          organization_id: string
          reason?: string | null
          started_at?: string
          stats?: Json | null
        }
        Update: {
          created_at?: string
          event_payload?: Json
          finished_at?: string | null
          function_name?: string
          id?: string
          ok?: boolean
          organization_id?: string
          reason?: string | null
          started_at?: string
          stats?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          auto_draft: boolean
          competitor_id: string | null
          created_at: string
          embedding: string | null
          evidence_refs: string[]
          id: string
          metadata: Json
          organization_id: string
          position: number | null
          reasoning: string
          run_id: string | null
          sentiment: Database["public"]["Enums"]["sentiment_label"]
          severity: Database["public"]["Enums"]["severity_level"]
          source_type: Database["public"]["Enums"]["signal_source_type"]
          source_url: string
          summary: string
        }
        Insert: {
          auto_draft?: boolean
          competitor_id?: string | null
          created_at?: string
          embedding?: string | null
          evidence_refs: string[]
          id?: string
          metadata?: Json
          organization_id: string
          position?: number | null
          reasoning: string
          run_id?: string | null
          sentiment: Database["public"]["Enums"]["sentiment_label"]
          severity: Database["public"]["Enums"]["severity_level"]
          source_type: Database["public"]["Enums"]["signal_source_type"]
          source_url: string
          summary: string
        }
        Update: {
          auto_draft?: boolean
          competitor_id?: string | null
          created_at?: string
          embedding?: string | null
          evidence_refs?: string[]
          id?: string
          metadata?: Json
          organization_id?: string
          position?: number | null
          reasoning?: string
          run_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_label"]
          severity?: Database["public"]["Enums"]["severity_level"]
          source_type?: Database["public"]["Enums"]["signal_source_type"]
          source_url?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          captured_at: string
          created_at: string
          embedding: string | null
          id: string
          model: string
          organization_id: string
          prompt: string
          response_text: string
          source_mcp: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          embedding?: string | null
          id?: string
          model: string
          organization_id: string
          prompt: string
          response_text: string
          source_mcp: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          embedding?: string | null
          id?: string
          model?: string
          organization_id?: string
          prompt?: string
          response_text?: string
          source_mcp?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: never; Returns: string }
    }
    Enums: {
      brief_channel: "slack" | "email"
      brief_status: "queued" | "sent" | "failed"
      content_channel: "blog" | "x_thread" | "linkedin" | "email"
      content_status: "generated" | "edited" | "sent" | "archived"
      cost_service:
        | "openai"
        | "anthropic"
        | "peec"
        | "tavily"
        | "firecrawl"
        | "telli"
        | "elevenlabs"
      counter_draft_channel: "x" | "linkedin" | "blog" | "multi"
      counter_draft_status: "draft" | "approved" | "rejected" | "published"
      prelaunch_verdict: "clear" | "caution" | "clash"
      sentiment_label: "positive" | "neutral" | "negative"
      severity_level: "low" | "med" | "high"
      signal_source_type: "competitor" | "internal" | "external" | "peec_delta"
      voice_outcome: "answered" | "voicemail" | "failed"
      voice_preference: "voice-agent" | "tts" | "markdown"
      voice_provider: "telli" | "elevenlabs" | "markdown"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      brief_channel: ["slack", "email"],
      brief_status: ["queued", "sent", "failed"],
      content_channel: ["blog", "x_thread", "linkedin", "email"],
      content_status: ["generated", "edited", "sent", "archived"],
      cost_service: [
        "openai",
        "anthropic",
        "peec",
        "tavily",
        "firecrawl",
        "telli",
        "elevenlabs",
      ],
      counter_draft_channel: ["x", "linkedin", "blog", "multi"],
      counter_draft_status: ["draft", "approved", "rejected", "published"],
      prelaunch_verdict: ["clear", "caution", "clash"],
      sentiment_label: ["positive", "neutral", "negative"],
      severity_level: ["low", "med", "high"],
      signal_source_type: ["competitor", "internal", "external", "peec_delta"],
      voice_outcome: ["answered", "voicemail", "failed"],
      voice_preference: ["voice-agent", "tts", "markdown"],
      voice_provider: ["telli", "elevenlabs", "markdown"],
    },
  },
} as const
