// Generated from the live Supabase schema (project fpgfeqbxywwufagctzwj).
// Regenerate after every migration: supabase gen types typescript, or the
// Supabase MCP generate_typescript_types tool.
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
      ai_events: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          outcome: Database["public"]["Enums"]["ai_outcome"]
          output_tokens: number | null
          tenant_id: string
          ticket_id: string
          tools_called: Json
          turn: number
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          outcome: Database["public"]["Enums"]["ai_outcome"]
          output_tokens?: number | null
          tenant_id?: string
          ticket_id: string
          tools_called?: Json
          turn?: number
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          outcome?: Database["public"]["Enums"]["ai_outcome"]
          output_tokens?: number | null
          tenant_id?: string
          ticket_id?: string
          tools_called?: Json
          turn?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      used_login_tokens: {
        Row: {
          email: string
          jti: string
          used_at: string
        }
        Insert: {
          email: string
          jti: string
          used_at?: string
        }
        Update: {
          email?: string
          jti?: string
          used_at?: string
        }
        Relationships: []
      }
      trend_snapshots: {
        Row: {
          computed_at: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          payload?: Json
          tenant_id: string
        }
        Update: {
          computed_at?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      company_domains: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          domain: string
          id: string
          source: string
          tenant_id: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          source?: string
          tenant_id?: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          tenant_id: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          tenant_id?: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_senders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          pattern: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          pattern: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          pattern?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowed_senders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_incidents: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          done_emails: Json
          draft_message: string | null
          id: string
          recipients: Json
          sent_at: string | null
          sent_count: number
          source: string
          status: string
          summary: string
          supplier: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          done_emails?: Json
          draft_message?: string | null
          id?: string
          recipients?: Json
          sent_at?: string | null
          sent_count?: number
          source?: string
          status?: string
          summary: string
          supplier: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          done_emails?: Json
          draft_message?: string | null
          id?: string
          recipients?: Json
          sent_at?: string | null
          sent_count?: number
          source?: string
          status?: string
          summary?: string
          supplier?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_incidents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_embeddings: {
        Row: {
          embedding: string | null
          ticket_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          embedding?: string | null
          ticket_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          embedding?: string | null
          ticket_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_embeddings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_reviews: {
        Row: {
          addresses_question: boolean
          commercial_commitment: boolean
          created_at: string
          grounded: boolean
          id: string
          issues: Json
          message_id: string
          model: string | null
          note: string | null
          on_brand: boolean
          target_role: string
          tenant_id: string
          ticket_id: string
          verdict: string
        }
        Insert: {
          addresses_question?: boolean
          commercial_commitment?: boolean
          created_at?: string
          grounded?: boolean
          id?: string
          issues?: Json
          message_id: string
          model?: string | null
          note?: string | null
          on_brand?: boolean
          target_role?: string
          tenant_id?: string
          ticket_id: string
          verdict: string
        }
        Update: {
          addresses_question?: boolean
          commercial_commitment?: boolean
          created_at?: string
          grounded?: boolean
          id?: string
          issues?: Json
          message_id?: string
          model?: string | null
          note?: string | null
          on_brand?: boolean
          target_role?: string
          tenant_id?: string
          ticket_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_reviews_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_reviews_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_type: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string
        }
        Update: {
          action?: string
          actor?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_senders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          pattern: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          pattern: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          pattern?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_senders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      canned_responses: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canned_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_sync_state: {
        Row: {
          channel: Database["public"]["Enums"]["ticket_channel"]
          state: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["ticket_channel"]
          state?: Json
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["ticket_channel"]
          state?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_sync_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_article_usage: {
        Row: {
          article_id: string
          cited: boolean
          created_at: string
          id: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          article_id: string
          cited?: boolean
          created_at?: string
          id?: string
          tenant_id?: string
          ticket_id: string
        }
        Update: {
          article_id?: string
          cited?: boolean
          created_at?: string
          id?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_article_usage_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_article_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_article_usage_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          body: string
          body_fts: unknown
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          source: Database["public"]["Enums"]["kb_source"]
          source_hash: string | null
          source_ticket_id: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["kb_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          body_fts?: unknown
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          source?: Database["public"]["Enums"]["kb_source"]
          source_hash?: string | null
          source_ticket_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["kb_status"]
          tenant_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          body_fts?: unknown
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          source?: Database["public"]["Enums"]["kb_source"]
          source_hash?: string | null
          source_ticket_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["kb_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          author: string | null
          body_fts: unknown
          body_html: string | null
          body_text: string
          channel_meta: Json
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          author?: string | null
          body_fts?: unknown
          body_html?: string | null
          body_text?: string
          channel_meta?: Json
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["message_role"]
          tenant_id?: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          author?: string | null
          body_fts?: unknown
          body_html?: string | null
          body_text?: string
          channel_meta?: Json
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor: string | null
          body: string | null
          created_at: string
          emailed_at: string | null
          id: string
          read_at: string | null
          recipient: string
          tenant_id: string
          ticket_id: string | null
          title: string
          type: string
        }
        Insert: {
          actor?: string | null
          body?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          read_at?: string | null
          recipient: string
          tenant_id?: string
          ticket_id?: string | null
          title: string
          type: string
        }
        Update: {
          actor?: string | null
          body?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          read_at?: string | null
          recipient?: string
          tenant_id?: string
          ticket_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          business_hours: boolean
          created_at: string
          first_response_minutes: number
          id: string
          name: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolve_minutes: number
          tenant_id: string
        }
        Insert: {
          business_hours?: boolean
          created_at?: string
          first_response_minutes: number
          id?: string
          name: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolve_minutes: number
          tenant_id?: string
        }
        Update: {
          business_hours?: boolean
          created_at?: string
          first_response_minutes?: number
          id?: string
          name?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolve_minutes?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
          tenant_id?: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      ticket_presence: {
        Row: {
          agent_email: string
          agent_name: string | null
          last_seen: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          agent_email: string
          agent_name?: string | null
          last_seen?: string
          tenant_id?: string
          ticket_id: string
        }
        Update: {
          agent_email?: string
          agent_name?: string | null
          last_seen?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_presence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_presence_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          ai_resolved: boolean
          assignee: string | null
          cc_emails: string[]
          channel: Database["public"]["Enums"]["ticket_channel"]
          client_id: string | null
          created_at: string
          crm_activity_at: string | null
          csat_comment: string | null
          csat_score: number | null
          email_thread_key: string | null
          escalation_reason: string | null
          first_response_at: string | null
          id: string
          intent: string | null
          language: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          reference: number
          requester_email: string
          requester_name: string | null
          resolved_at: string | null
          sla_policy_id: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          supplier_ticket_ref: string | null
          tags: string[]
          tenant_id: string
          updated_at: string
          watchers: string[]
        }
        Insert: {
          ai_resolved?: boolean
          assignee?: string | null
          cc_emails?: string[]
          channel?: Database["public"]["Enums"]["ticket_channel"]
          client_id?: string | null
          created_at?: string
          crm_activity_at?: string | null
          csat_comment?: string | null
          csat_score?: number | null
          email_thread_key?: string | null
          escalation_reason?: string | null
          first_response_at?: string | null
          id?: string
          intent?: string | null
          language?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reference?: never
          requester_email: string
          requester_name?: string | null
          resolved_at?: string | null
          sla_policy_id?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          supplier_ticket_ref?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          watchers?: string[]
        }
        Update: {
          ai_resolved?: boolean
          assignee?: string | null
          cc_emails?: string[]
          channel?: Database["public"]["Enums"]["ticket_channel"]
          client_id?: string | null
          created_at?: string
          crm_activity_at?: string | null
          csat_comment?: string | null
          csat_score?: number | null
          email_thread_key?: string | null
          escalation_reason?: string | null
          first_response_at?: string | null
          id?: string
          intent?: string | null
          language?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reference?: never
          requester_email?: string
          requester_name?: string | null
          resolved_at?: string | null
          sla_policy_id?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          supplier_ticket_ref?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          watchers?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_replies_needing_qa: {
        Args: { p_tenant?: string; p_limit?: number }
        Returns: {
          message_id: string
          ticket_id: string
          body_text: string
          created_at: string
        }[]
      }
      match_kb_articles: {
        Args: {
          match_count?: number
          p_tenant_id?: string
          query_embedding: string
        }
        Returns: {
          body: string
          id: string
          similarity: number
          source_url: string
          title: string
        }[]
      }
      match_tickets: {
        Args: {
          query_embedding: string
          p_tenant?: string
          match_count?: number
          min_similarity?: number
        }
        Returns: {
          ticket_id: string
          reference: number
          subject: string
          status: Database["public"]["Enums"]["ticket_status"]
          resolved_at: string | null
          similarity: number
        }[]
      }
      search_past_tickets: {
        Args: {
          match_count?: number
          p_client_id?: string
          p_tenant_id?: string
          query_text: string
        }
        Returns: {
          rank: number
          resolved_at: string
          snippet: string
          subject: string
          ticket_id: string
        }[]
      }
      search_tickets: {
        Args: {
          q: string
          p_tenant?: string
          p_statuses?: string[]
          p_assignee?: string
          p_since?: string
          p_limit?: number
        }
        Returns: {
          id: string
          reference: number
          subject: string
          requester_email: string
          requester_name: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          priority: Database["public"]["Enums"]["ticket_priority"]
          assignee: string | null
          updated_at: string
          rank: number
          snippet: string
        }[]
      }
      stamp_tickets_for_domain: {
        Args: { p_client_id: string; p_domain: string; p_tenant_id: string }
        Returns: number
      }
      tickets_awaiting_response: {
        Args: { p_tenant_id?: string }
        Returns: {
          ticket_id: string
          waiting_since: string
        }[]
      }
      tickets_needing_embedding: {
        Args: { p_tenant?: string; p_limit?: number }
        Returns: {
          id: string
          subject: string
        }[]
      }
    }
    Enums: {
      actor_type: "ai" | "human" | "system"
      ai_outcome: "answered" | "action_taken" | "escalated" | "clarified"
      kb_source:
        | "manual"
        | "scan"
        | "ticket_mined"
        | "zendesk_import"
        | "knowledge_bot"
        | "university"
      kb_status: "draft" | "review" | "published" | "archived"
      message_role: "customer" | "ai" | "human" | "internal_note" | "system"
      ticket_channel: "email" | "widget" | "portal" | "whatsapp"
      ticket_priority: "p1" | "p2" | "p3"
      ticket_status:
        | "new"
        | "ai_working"
        | "waiting_on_customer"
        | "escalated"
        | "resolved"
        | "closed"
        | "pending"
        | "awaiting_approval"
        | "needs_review"
        | "awaiting_supplier"
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
      actor_type: ["ai", "human", "system"],
      ai_outcome: ["answered", "action_taken", "escalated", "clarified"],
      kb_source: [
        "manual",
        "scan",
        "ticket_mined",
        "zendesk_import",
        "knowledge_bot",
        "university",
      ],
      kb_status: ["draft", "review", "published", "archived"],
      message_role: ["customer", "ai", "human", "internal_note", "system"],
      ticket_channel: ["email", "widget", "portal", "whatsapp"],
      ticket_priority: ["p1", "p2", "p3"],
      ticket_status: [
        "new",
        "ai_working",
        "waiting_on_customer",
        "escalated",
        "resolved",
        "closed",
        "pending",
        "awaiting_approval",
        "needs_review",
        "awaiting_supplier",
      ],
    },
  },
} as const
