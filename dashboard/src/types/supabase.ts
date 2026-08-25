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
      activity_logs: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          hub_id: string | null
          id: string
          metadata: Json | null
          rider_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          hub_id?: string | null
          id?: string
          metadata?: Json | null
          rider_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          hub_id?: string | null
          id?: string
          metadata?: Json | null
          rider_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          created_at: string
          date: string
          hours: number | null
          hub_id: string | null
          id: string
          notes: string | null
          rider_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"] | null
          time_in: string | null
          time_out: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          hours?: number | null
          hub_id?: string | null
          id?: string
          notes?: string | null
          rider_id: string
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"] | null
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          hours?: number | null
          hub_id?: string | null
          id?: string
          notes?: string | null
          rider_id?: string
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"] | null
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_policy_configuration_audit: {
        Row: {
          action: string
          change_reason: string
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          policy_configuration_id: string
        }
        Insert: {
          action: string
          change_reason: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          policy_configuration_id: string
        }
        Update: {
          action?: string
          change_reason?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          policy_configuration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_policy_configuration_au_policy_configuration_id_fkey"
            columns: ["policy_configuration_id"]
            isOneToOne: false
            referencedRelation: "attendance_policy_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_policy_configuration_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_policy_configurations: {
        Row: {
          active: boolean
          change_reason: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          id: string
          late_threshold: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          change_reason: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_until?: string | null
          id?: string
          late_threshold?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          change_reason?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          late_threshold?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_policy_configurations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_policy_configurations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_link: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          hub_id: string | null
          id: string
          message: string
          metadata: Json | null
          priority: Database["public"]["Enums"]["notification_priority"]
          read: boolean
          recipient_id: string | null
          rider_id: string | null
          sender_id: string | null
          target_roles: Database["public"]["Enums"]["user_role"][]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          violation_id: string | null
        }
        Insert: {
          action_link?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          hub_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["notification_priority"]
          read?: boolean
          recipient_id?: string | null
          rider_id?: string | null
          sender_id?: string | null
          target_roles?: Database["public"]["Enums"]["user_role"][]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          violation_id?: string | null
        }
        Update: {
          action_link?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          hub_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["notification_priority"]
          read?: boolean
          recipient_id?: string | null
          rider_id?: string | null
          sender_id?: string | null
          target_roles?: Database["public"]["Enums"]["user_role"][]
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          violation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_violation_id_fkey"
            columns: ["violation_id"]
            isOneToOne: false
            referencedRelation: "violations"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_correction_requests: {
        Row: {
          created_at: string
          date: string
          hub_id: string | null
          id: string
          parcel_log_id: string
          previous_delivered: number
          previous_failed: number
          previous_heavy: number
          previous_returned: number
          reason: string
          requested_at: string
          requested_by: string | null
          requested_delivered: number
          requested_failed: number
          requested_heavy: number
          requested_returned: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rider_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          hub_id?: string | null
          id?: string
          parcel_log_id: string
          previous_delivered?: number
          previous_failed?: number
          previous_heavy?: number
          previous_returned?: number
          reason: string
          requested_at?: string
          requested_by?: string | null
          requested_delivered?: number
          requested_failed?: number
          requested_heavy?: number
          requested_returned?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rider_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          hub_id?: string | null
          id?: string
          parcel_log_id?: string
          previous_delivered?: number
          previous_failed?: number
          previous_heavy?: number
          previous_returned?: number
          reason?: string
          requested_at?: string
          requested_by?: string | null
          requested_delivered?: number
          requested_failed?: number
          requested_heavy?: number
          requested_returned?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rider_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcel_correction_requests_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_correction_requests_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_correction_requests_parcel_log_id_fkey"
            columns: ["parcel_log_id"]
            isOneToOne: false
            referencedRelation: "parcel_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_correction_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_correction_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_correction_requests_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_log_audit: {
        Row: {
          action_type: string
          approved_by: string | null
          changed_by: string | null
          correction_request_id: string | null
          date: string
          hub_id: string | null
          id: string
          new_delivered: number
          new_failed: number
          new_heavy: number
          new_returned: number
          old_delivered: number
          old_failed: number
          old_heavy: number
          old_returned: number
          parcel_log_id: string
          reason: string | null
          rider_id: string
          timestamp: string
        }
        Insert: {
          action_type: string
          approved_by?: string | null
          changed_by?: string | null
          correction_request_id?: string | null
          date: string
          hub_id?: string | null
          id?: string
          new_delivered?: number
          new_failed?: number
          new_heavy?: number
          new_returned?: number
          old_delivered?: number
          old_failed?: number
          old_heavy?: number
          old_returned?: number
          parcel_log_id: string
          reason?: string | null
          rider_id: string
          timestamp?: string
        }
        Update: {
          action_type?: string
          approved_by?: string | null
          changed_by?: string | null
          correction_request_id?: string | null
          date?: string
          hub_id?: string | null
          id?: string
          new_delivered?: number
          new_failed?: number
          new_heavy?: number
          new_returned?: number
          old_delivered?: number
          old_failed?: number
          old_heavy?: number
          old_returned?: number
          parcel_log_id?: string
          reason?: string | null
          rider_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcel_log_audit_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_log_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_log_audit_correction_request_id_fkey"
            columns: ["correction_request_id"]
            isOneToOne: false
            referencedRelation: "parcel_correction_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_log_audit_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_log_audit_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_log_audit_parcel_log_id_fkey"
            columns: ["parcel_log_id"]
            isOneToOne: false
            referencedRelation: "parcel_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_log_audit_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_logs: {
        Row: {
          assigned_parcels: number | null
          created_at: string
          created_by: string | null
          daily_gross: number | null
          date: string
          failed_parcels: number | null
          heavy_earnings: number
          heavy_parcels: number
          heavy_rate: number | null
          hub_id: string | null
          id: string
          notes: string | null
          parcels: number
          rate: number
          rate_configuration_id: string | null
          returned_parcels: number | null
          rider_id: string
          standard_earnings: number
          updated_at: string
        }
        Insert: {
          assigned_parcels?: number | null
          created_at?: string
          created_by?: string | null
          daily_gross?: number | null
          date: string
          failed_parcels?: number | null
          heavy_earnings?: number
          heavy_parcels?: number
          heavy_rate?: number | null
          hub_id?: string | null
          id?: string
          notes?: string | null
          parcels?: number
          rate?: number
          rate_configuration_id?: string | null
          returned_parcels?: number | null
          rider_id: string
          standard_earnings?: number
          updated_at?: string
        }
        Update: {
          assigned_parcels?: number | null
          created_at?: string
          created_by?: string | null
          daily_gross?: number | null
          date?: string
          failed_parcels?: number | null
          heavy_earnings?: number
          heavy_parcels?: number
          heavy_rate?: number | null
          hub_id?: string | null
          id?: string
          notes?: string | null
          parcels?: number
          rate?: number
          rate_configuration_id?: string | null
          returned_parcels?: number | null
          rider_id?: string
          standard_earnings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcel_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_logs_rate_configuration_id_fkey"
            columns: ["rate_configuration_id"]
            isOneToOne: false
            referencedRelation: "parcel_rate_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_logs_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_rate_configuration_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          effective_date: string
          id: string
          new_values: Json
          previous_values: Json | null
          rate_configuration_id: string
          reason: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          effective_date: string
          id?: string
          new_values: Json
          previous_values?: Json | null
          rate_configuration_id: string
          reason: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          effective_date?: string
          id?: string
          new_values?: Json
          previous_values?: Json | null
          rate_configuration_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcel_rate_configuration_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_rate_configuration_audit_rate_configuration_id_fkey"
            columns: ["rate_configuration_id"]
            isOneToOne: false
            referencedRelation: "parcel_rate_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_rate_configurations: {
        Row: {
          active: boolean
          change_reason: string
          created_at: string
          created_by: string | null
          early_standard_rate: number
          effective_from: string
          effective_until: string | null
          heavy_parcel_rate: number
          heavy_threshold_kg: number
          id: string
          late_standard_rate: number
          regular_standard_rate: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          change_reason: string
          created_at?: string
          created_by?: string | null
          early_standard_rate: number
          effective_from: string
          effective_until?: string | null
          heavy_parcel_rate: number
          heavy_threshold_kg: number
          id?: string
          late_standard_rate: number
          regular_standard_rate: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          change_reason?: string
          created_at?: string
          created_by?: string | null
          early_standard_rate?: number
          effective_from?: string
          effective_until?: string | null
          heavy_parcel_rate?: number
          heavy_threshold_kg?: number
          id?: string
          late_standard_rate?: number
          regular_standard_rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcel_rate_configurations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcel_rate_configurations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_adjustment_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          hub_id: string
          id: string
          new_values: Json | null
          payroll_record_id: string | null
          previous_values: Json | null
          reason: string
          rider_id: string
          source: Database["public"]["Enums"]["payroll_adjustment_source"]
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          hub_id: string
          id?: string
          new_values?: Json | null
          payroll_record_id?: string | null
          previous_values?: Json | null
          reason: string
          rider_id: string
          source: Database["public"]["Enums"]["payroll_adjustment_source"]
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          hub_id?: string
          id?: string
          new_values?: Json | null
          payroll_record_id?: string | null
          previous_values?: Json | null
          reason?: string
          rider_id?: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustment_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustment_audit_events_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustment_audit_events_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustment_audit_events_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_adjustment_definition_audit: {
        Row: {
          changed_at: string
          changed_by: string
          definition_code: string
          id: string
          new_values: Json
          previous_values: Json
          reason: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          definition_code: string
          id?: string
          new_values: Json
          previous_values: Json
          reason: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          definition_code?: string
          id?: string
          new_values?: Json
          previous_values?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustment_definition_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustment_definition_audit_definition_code_fkey"
            columns: ["definition_code"]
            isOneToOne: false
            referencedRelation: "payroll_adjustment_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      payroll_adjustment_definitions: {
        Row: {
          active: boolean
          category: string
          change_reason: string
          code: string
          created_at: string
          created_by: string | null
          display_name: string
          input_mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          category: string
          change_reason: string
          code: string
          created_at?: string
          created_by?: string | null
          display_name: string
          input_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          change_reason?: string
          code?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          input_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustment_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustment_definitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_bulk_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          cutoff_end: string
          cutoff_start: string
          id: string
          operation: string
          request_id: string
          request_payload: Json
          requested_by: string
          result: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cutoff_end: string
          cutoff_start: string
          id?: string
          operation: string
          request_id: string
          request_payload: Json
          requested_by: string
          result?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cutoff_end?: string
          cutoff_start?: string
          id?: string
          operation?: string
          request_id?: string
          request_payload?: Json
          requested_by?: string
          result?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_bulk_operations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_deduction_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          cutoff_end: string
          cutoff_start: string
          deduction_obligation_id: string
          hub_id: string
          id: string
          payroll_record_id: string | null
          rider_id: string
          source: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          cutoff_end: string
          cutoff_start: string
          deduction_obligation_id: string
          hub_id: string
          id?: string
          payroll_record_id?: string | null
          rider_id: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          cutoff_end?: string
          cutoff_start?: string
          deduction_obligation_id?: string
          hub_id?: string
          id?: string
          payroll_record_id?: string | null
          rider_id?: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_deduction_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_deduction_obligation_id_fkey"
            columns: ["deduction_obligation_id"]
            isOneToOne: false
            referencedRelation: "payroll_deduction_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_deduction_obligation_id_fkey"
            columns: ["deduction_obligation_id"]
            isOneToOne: false
            referencedRelation: "v_payroll_deduction_balances"
            referencedColumns: ["obligation_id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_allocations_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_deduction_obligations: {
        Row: {
          adjustment_code: string
          adjustment_date: string
          created_at: string
          created_by: string | null
          hub_id: string
          id: string
          original_amount: number
          reason: string
          reference: string | null
          rider_id: string
          source: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          adjustment_code: string
          adjustment_date: string
          created_at?: string
          created_by?: string | null
          hub_id: string
          id?: string
          original_amount: number
          reason: string
          reference?: string | null
          rider_id: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          adjustment_code?: string
          adjustment_date?: string
          created_at?: string
          created_by?: string | null
          hub_id?: string
          id?: string
          original_amount?: number
          reason?: string
          reference?: string | null
          rider_id?: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_deduction_obligations_adjustment_code_fkey"
            columns: ["adjustment_code"]
            isOneToOne: false
            referencedRelation: "payroll_adjustment_definitions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_delivery_lines: {
        Row: {
          applied_heavy_rate: number | null
          applied_standard_rate: number
          calculation_version: number
          created_at: string
          date: string
          failed: number
          gross_delivery_pay: number
          heavy_delivered: number
          heavy_earnings: number
          hub_id: string | null
          id: string
          payroll_record_id: string
          rate_configuration_id: string | null
          returned: number
          rider_id: string
          standard_delivered: number
          standard_earnings: number
        }
        Insert: {
          applied_heavy_rate?: number | null
          applied_standard_rate: number
          calculation_version?: number
          created_at?: string
          date: string
          failed?: number
          gross_delivery_pay?: number
          heavy_delivered?: number
          heavy_earnings?: number
          hub_id?: string | null
          id?: string
          payroll_record_id: string
          rate_configuration_id?: string | null
          returned?: number
          rider_id: string
          standard_delivered?: number
          standard_earnings?: number
        }
        Update: {
          applied_heavy_rate?: number | null
          applied_standard_rate?: number
          calculation_version?: number
          created_at?: string
          date?: string
          failed?: number
          gross_delivery_pay?: number
          heavy_delivered?: number
          heavy_earnings?: number
          hub_id?: string | null
          id?: string
          payroll_record_id?: string
          rate_configuration_id?: string | null
          returned?: number
          rider_id?: string
          standard_delivered?: number
          standard_earnings?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_delivery_lines_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_delivery_lines_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_delivery_lines_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_delivery_lines_rate_configuration_id_fkey"
            columns: ["rate_configuration_id"]
            isOneToOne: false
            referencedRelation: "parcel_rate_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_delivery_lines_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_earning_adjustments: {
        Row: {
          adjustment_code: string
          adjustment_date: string
          amount: number
          created_at: string
          created_by: string | null
          cutoff_end: string
          cutoff_start: string
          hub_id: string
          id: string
          payroll_record_id: string | null
          reason: string
          reference: string | null
          rider_id: string
          source: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          adjustment_code: string
          adjustment_date: string
          amount: number
          created_at?: string
          created_by?: string | null
          cutoff_end: string
          cutoff_start: string
          hub_id: string
          id?: string
          payroll_record_id?: string | null
          reason: string
          reference?: string | null
          rider_id: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          adjustment_code?: string
          adjustment_date?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          cutoff_end?: string
          cutoff_start?: string
          hub_id?: string
          id?: string
          payroll_record_id?: string | null
          reason?: string
          reference?: string | null
          rider_id?: string
          source?: Database["public"]["Enums"]["payroll_adjustment_source"]
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_earning_adjustments_adjustment_code_fkey"
            columns: ["adjustment_code"]
            isOneToOne: false
            referencedRelation: "payroll_adjustment_definitions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_earning_adjustments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          adjustment_snapshot: Json | null
          adjustment_snapshot_version: number | null
          adjustment_source_version: number
          approved_at: string | null
          approved_by: string | null
          approved_by_email_snapshot: string | null
          approved_by_name_snapshot: string | null
          calculation_version: number
          created_at: string
          cutoff_end: string
          cutoff_start: string
          deductions: number | null
          early_standard_rate_snapshot: number | null
          fm_pickup_amount: number
          fm_pickup_count: number | null
          gross_pay: number | null
          heavy_earnings: number
          heavy_parcels: number
          heavy_rate_snapshot: number | null
          heavy_threshold_kg_snapshot: number | null
          hub_id: string | null
          id: string
          late_onhold: number | null
          late_remittance: number | null
          late_standard_rate_snapshot: number | null
          net_pay_snapshot: number | null
          notes: string | null
          other_earnings: number | null
          paid_at: string | null
          paid_by: string | null
          paid_by_email_snapshot: string | null
          paid_by_name_snapshot: string | null
          processed_at: string | null
          rate_configuration_id: string | null
          rate_per_parcel: number
          regular_standard_rate_snapshot: number | null
          rejected_at: string | null
          rejected_by: string | null
          rejected_by_email_snapshot: string | null
          rejected_by_name_snapshot: string | null
          rejection_reason: string | null
          returned_at: string | null
          returned_by: string | null
          returned_by_email_snapshot: string | null
          returned_by_name_snapshot: string | null
          rider_id: string
          snapshot_finalized_at: string | null
          standard_earnings: number
          standard_parcels: number
          status: Database["public"]["Enums"]["payroll_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_by_email_snapshot: string | null
          submitted_by_name_snapshot: string | null
          total_deductions_snapshot: number | null
          total_earnings_snapshot: number | null
          total_parcels: number
          updated_at: string
        }
        Insert: {
          adjustment_snapshot?: Json | null
          adjustment_snapshot_version?: number | null
          adjustment_source_version?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email_snapshot?: string | null
          approved_by_name_snapshot?: string | null
          calculation_version?: number
          created_at?: string
          cutoff_end: string
          cutoff_start: string
          deductions?: number | null
          early_standard_rate_snapshot?: number | null
          fm_pickup_amount?: number
          fm_pickup_count?: number | null
          gross_pay?: number | null
          heavy_earnings?: number
          heavy_parcels?: number
          heavy_rate_snapshot?: number | null
          heavy_threshold_kg_snapshot?: number | null
          hub_id?: string | null
          id?: string
          late_onhold?: number | null
          late_remittance?: number | null
          late_standard_rate_snapshot?: number | null
          net_pay_snapshot?: number | null
          notes?: string | null
          other_earnings?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_email_snapshot?: string | null
          paid_by_name_snapshot?: string | null
          processed_at?: string | null
          rate_configuration_id?: string | null
          rate_per_parcel?: number
          regular_standard_rate_snapshot?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_by_email_snapshot?: string | null
          rejected_by_name_snapshot?: string | null
          rejection_reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          returned_by_email_snapshot?: string | null
          returned_by_name_snapshot?: string | null
          rider_id: string
          snapshot_finalized_at?: string | null
          standard_earnings?: number
          standard_parcels?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_email_snapshot?: string | null
          submitted_by_name_snapshot?: string | null
          total_deductions_snapshot?: number | null
          total_earnings_snapshot?: number | null
          total_parcels?: number
          updated_at?: string
        }
        Update: {
          adjustment_snapshot?: Json | null
          adjustment_snapshot_version?: number | null
          adjustment_source_version?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email_snapshot?: string | null
          approved_by_name_snapshot?: string | null
          calculation_version?: number
          created_at?: string
          cutoff_end?: string
          cutoff_start?: string
          deductions?: number | null
          early_standard_rate_snapshot?: number | null
          fm_pickup_amount?: number
          fm_pickup_count?: number | null
          gross_pay?: number | null
          heavy_earnings?: number
          heavy_parcels?: number
          heavy_rate_snapshot?: number | null
          heavy_threshold_kg_snapshot?: number | null
          hub_id?: string | null
          id?: string
          late_onhold?: number | null
          late_remittance?: number | null
          late_standard_rate_snapshot?: number | null
          net_pay_snapshot?: number | null
          notes?: string | null
          other_earnings?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_email_snapshot?: string | null
          paid_by_name_snapshot?: string | null
          processed_at?: string | null
          rate_configuration_id?: string | null
          rate_per_parcel?: number
          regular_standard_rate_snapshot?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_by_email_snapshot?: string | null
          rejected_by_name_snapshot?: string | null
          rejection_reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          returned_by_email_snapshot?: string | null
          returned_by_name_snapshot?: string | null
          rider_id?: string
          snapshot_finalized_at?: string | null
          standard_earnings?: number
          standard_parcels?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_email_snapshot?: string | null
          submitted_by_name_snapshot?: string | null
          total_deductions_snapshot?: number | null
          total_earnings_snapshot?: number | null
          total_parcels?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_rate_configuration_id_fkey"
            columns: ["rate_configuration_id"]
            isOneToOne: false
            referencedRelation: "parcel_rate_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string
          created_at: string
          id: string
          name: string
          rating: number
          role_title: string | null
          status: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          name: string
          rating: number
          role_title?: string | null
          status?: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          name?: string
          rating?: number
          role_title?: string | null
          status?: string
        }
        Relationships: []
      }
      rider_assignments: {
        Row: {
          assignment_type: string
          created_at: string
          created_by: string
          end_date: string | null
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          from_hub_id: string | null
          from_zone_id: string | null
          id: string
          reason: string
          rider_id: string
          start_date: string
          status: string
          target_hub_id: string
          target_zone_id: string
          updated_at: string
        }
        Insert: {
          assignment_type: string
          created_at?: string
          created_by: string
          end_date?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          from_hub_id?: string | null
          from_zone_id?: string | null
          id?: string
          reason: string
          rider_id: string
          start_date: string
          status: string
          target_hub_id: string
          target_zone_id: string
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          created_by?: string
          end_date?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          from_hub_id?: string | null
          from_zone_id?: string | null
          id?: string
          reason?: string
          rider_id?: string
          start_date?: string
          status?: string
          target_hub_id?: string
          target_zone_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_from_hub_id_fkey"
            columns: ["from_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_from_hub_id_fkey"
            columns: ["from_hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_from_zone_id_fkey"
            columns: ["from_zone_id"]
            isOneToOne: false
            referencedRelation: "public_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_from_zone_id_fkey"
            columns: ["from_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_target_hub_id_fkey"
            columns: ["target_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_target_hub_id_fkey"
            columns: ["target_hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_target_zone_id_fkey"
            columns: ["target_zone_id"]
            isOneToOne: false
            referencedRelation: "public_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_assignments_target_zone_id_fkey"
            columns: ["target_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_documents: {
        Row: {
          created_at: string
          document_label: string | null
          document_number: string | null
          document_type: string
          expiration_date: string | null
          file_size_bytes: number
          hub_id: string | null
          id: string
          issue_date: string | null
          mime_type: string
          notes: string | null
          original_filename: string
          rider_id: string
          storage_path: string
          updated_at: string
          uploaded_by: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_label?: string | null
          document_number?: string | null
          document_type: string
          expiration_date?: string | null
          file_size_bytes: number
          hub_id?: string | null
          id?: string
          issue_date?: string | null
          mime_type: string
          notes?: string | null
          original_filename: string
          rider_id: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_label?: string | null
          document_number?: string | null
          document_type?: string
          expiration_date?: string | null
          file_size_bytes?: number
          hub_id?: string | null
          id?: string
          issue_date?: string | null
          mime_type?: string
          notes?: string | null
          original_filename?: string
          rider_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_documents_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_documents_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_documents_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_locations: {
        Row: {
          hub_id: string | null
          id: string
          lat: number
          lng: number
          recorded_at: string
          rider_id: string
          speed: number | null
          status: Database["public"]["Enums"]["rider_status"]
        }
        Insert: {
          hub_id?: string | null
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          rider_id: string
          speed?: number | null
          status?: Database["public"]["Enums"]["rider_status"]
        }
        Update: {
          hub_id?: string | null
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          rider_id?: string
          speed?: number | null
          status?: Database["public"]["Enums"]["rider_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rider_locations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_locations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_locations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          avatar_url: string | null
          barangay: string | null
          city: string | null
          contact: string | null
          created_at: string
          date_of_hire: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string | null
          face_descriptor: Json | null
          face_image_url: string | null
          face_registered: boolean
          face_registered_at: string | null
          home_hub_id: string | null
          home_zone_id: string | null
          hub_id: string | null
          id: string
          last_ping: string | null
          lat: number | null
          lng: number | null
          mkb_id: string
          name: string
          notes: string | null
          province: string | null
          shift: Database["public"]["Enums"]["shift_type"] | null
          speed: number | null
          status: Database["public"]["Enums"]["rider_status"]
          street_address: string | null
          updated_at: string
          vehicle_plate_number: string | null
          vehicle_type: string | null
          zip_code: string | null
          zone_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          barangay?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string
          date_of_hire?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string | null
          face_descriptor?: Json | null
          face_image_url?: string | null
          face_registered?: boolean
          face_registered_at?: string | null
          home_hub_id?: string | null
          home_zone_id?: string | null
          hub_id?: string | null
          id?: string
          last_ping?: string | null
          lat?: number | null
          lng?: number | null
          mkb_id: string
          name: string
          notes?: string | null
          province?: string | null
          shift?: Database["public"]["Enums"]["shift_type"] | null
          speed?: number | null
          status?: Database["public"]["Enums"]["rider_status"]
          street_address?: string | null
          updated_at?: string
          vehicle_plate_number?: string | null
          vehicle_type?: string | null
          zip_code?: string | null
          zone_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          barangay?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string
          date_of_hire?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string | null
          face_descriptor?: Json | null
          face_image_url?: string | null
          face_registered?: boolean
          face_registered_at?: string | null
          home_hub_id?: string | null
          home_zone_id?: string | null
          hub_id?: string | null
          id?: string
          last_ping?: string | null
          lat?: number | null
          lng?: number | null
          mkb_id?: string
          name?: string
          notes?: string | null
          province?: string | null
          shift?: Database["public"]["Enums"]["shift_type"] | null
          speed?: number | null
          status?: Database["public"]["Enums"]["rider_status"]
          street_address?: string | null
          updated_at?: string
          vehicle_plate_number?: string | null
          vehicle_type?: string | null
          zip_code?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "riders_home_hub_id_fkey"
            columns: ["home_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_home_hub_id_fkey"
            columns: ["home_hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_home_zone_id_fkey"
            columns: ["home_zone_id"]
            isOneToOne: false
            referencedRelation: "public_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_home_zone_id_fkey"
            columns: ["home_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "public_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      support_ticket_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          created_by: string
          description: string
          hub_id: string | null
          id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          created_by?: string
          description: string
          hub_id?: string | null
          id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number?: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          created_by?: string
          description?: string
          hub_id?: string | null
          id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          device_fingerprint_hash: string
          device_name: string
          device_uuid: string
          hub_id: string | null
          id: string
          ip_address: string | null
          last_used_at: string
          platform: string
          registered_at: string
          rider_id: string | null
          status: Database["public"]["Enums"]["device_status"]
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_fingerprint_hash: string
          device_name?: string
          device_uuid: string
          hub_id?: string | null
          id?: string
          ip_address?: string | null
          last_used_at?: string
          platform?: string
          registered_at?: string
          rider_id?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_fingerprint_hash?: string
          device_name?: string
          device_uuid?: string
          hub_id?: string | null
          id?: string
          ip_address?: string | null
          last_used_at?: string
          platform?: string
          registered_at?: string
          rider_id?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_devices_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_devices_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_hub_access: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          hub_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          hub_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          hub_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hub_access_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hub_access_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hub_access_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hub_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          attendance_alerts: boolean
          created_at: string
          payroll_updates: boolean
          sound_enabled: boolean
          support_ticket_updates: boolean
          system_updates: boolean
          toast_enabled: boolean
          updated_at: string
          user_id: string
          violation_alerts: boolean
        }
        Insert: {
          attendance_alerts?: boolean
          created_at?: string
          payroll_updates?: boolean
          sound_enabled?: boolean
          support_ticket_updates?: boolean
          system_updates?: boolean
          toast_enabled?: boolean
          updated_at?: string
          user_id: string
          violation_alerts?: boolean
        }
        Update: {
          attendance_alerts?: boolean
          created_at?: string
          payroll_updates?: boolean
          sound_enabled?: boolean
          support_ticket_updates?: boolean
          system_updates?: boolean
          toast_enabled?: boolean
          updated_at?: string
          user_id?: string
          violation_alerts?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          archive_effective_date: string | null
          archive_reason: string | null
          archive_remarks: string | null
          archived_at: string | null
          archived_by: string | null
          contact: string | null
          created_at: string
          date_of_hire: string | null
          email: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          employment_type: string | null
          full_name: string
          hub_access_scope: string
          id: string
          last_login: string | null
          notes: string | null
          restore_reason: string | null
          restored_at: string | null
          restored_by: string | null
          rider_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          archive_effective_date?: string | null
          archive_reason?: string | null
          archive_remarks?: string | null
          archived_at?: string | null
          archived_by?: string | null
          contact?: string | null
          created_at?: string
          date_of_hire?: string | null
          email: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          employment_type?: string | null
          full_name: string
          hub_access_scope?: string
          id: string
          last_login?: string | null
          notes?: string | null
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          rider_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          archive_effective_date?: string | null
          archive_reason?: string | null
          archive_remarks?: string | null
          archived_at?: string | null
          archived_by?: string | null
          contact?: string | null
          created_at?: string
          date_of_hire?: string | null
          email?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          employment_type?: string | null
          full_name?: string
          hub_access_scope?: string
          id?: string
          last_login?: string | null
          notes?: string | null
          restore_reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          rider_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      violations: {
        Row: {
          created_at: string
          hub_id: string | null
          id: string
          lat: number | null
          lng: number | null
          read: boolean
          resolved: boolean
          resolved_at: string | null
          rider_id: string
          type: Database["public"]["Enums"]["violation_type"]
          zone_id: string | null
          zone_name: string | null
        }
        Insert: {
          created_at?: string
          hub_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          read?: boolean
          resolved?: boolean
          resolved_at?: string | null
          rider_id: string
          type?: Database["public"]["Enums"]["violation_type"]
          zone_id?: string | null
          zone_name?: string | null
        }
        Update: {
          created_at?: string
          hub_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          read?: boolean
          resolved?: boolean
          resolved_at?: string | null
          rider_id?: string
          type?: Database["public"]["Enums"]["violation_type"]
          zone_id?: string | null
          zone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "violations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "public_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          color: string
          created_at: string
          hub_id: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          polygon_coordinates: Json | null
          radius: number | null
          status: Database["public"]["Enums"]["zone_status"]
          updated_at: string
          zone_type: string
        }
        Insert: {
          color?: string
          created_at?: string
          hub_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          polygon_coordinates?: Json | null
          radius?: number | null
          status?: Database["public"]["Enums"]["zone_status"]
          updated_at?: string
          zone_type?: string
        }
        Update: {
          color?: string
          created_at?: string
          hub_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          polygon_coordinates?: Json | null
          radius?: number | null
          status?: Database["public"]["Enums"]["zone_status"]
          updated_at?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zones_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      public_hubs: {
        Row: {
          description: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          description?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          description?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      public_zones: {
        Row: {
          color: string | null
          hub_id: string | null
          id: string | null
          lat: number | null
          lng: number | null
          name: string | null
          polygon_coordinates: Json | null
          radius: number | null
          zone_type: string | null
        }
        Insert: {
          color?: string | null
          hub_id?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          polygon_coordinates?: Json | null
          radius?: number | null
          zone_type?: string | null
        }
        Update: {
          color?: string | null
          hub_id?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          polygon_coordinates?: Json | null
          radius?: number | null
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zones_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zones_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_attendance_summary: {
        Row: {
          date: string | null
          hours: number | null
          hr_status: string | null
          hub_id: string | null
          id: string | null
          lat: number | null
          lng: number | null
          log_status: Database["public"]["Enums"]["attendance_status"] | null
          notes: string | null
          raw_time_in: string | null
          raw_time_out: string | null
          rider_avatar: string | null
          rider_code: string | null
          rider_id: string | null
          rider_name: string | null
          source: Database["public"]["Enums"]["attendance_source"] | null
          time_in: string | null
          time_out: string | null
          zone_id: string | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "public_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      v_payroll_deduction_balances: {
        Row: {
          adjustment_code: string | null
          adjustment_date: string | null
          available_to_allocate: number | null
          committed: number | null
          display_name: string | null
          hub_id: string | null
          obligation_id: string | null
          original_amount: number | null
          outstanding: number | null
          planned: number | null
          reason: string | null
          recovered: number | null
          reference: string | null
          rider_id: string | null
          status: string | null
          voided_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_deduction_obligations_adjustment_code_fkey"
            columns: ["adjustment_code"]
            isOneToOne: false
            referencedRelation: "payroll_adjustment_definitions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "public_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deduction_obligations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      actor_can_manage_user_hub: {
        Args: { p_actor_id: string; p_target_user_id: string }
        Returns: boolean
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_set_user_hub_access: {
        Args: { p_hub_ids?: string[]; p_scope: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_zone_hub: {
        Args: { p_hub_id: string; p_zone_id: string }
        Returns: undefined
      }
      bulk_approve_payroll_records: {
        Args: {
          p_cutoff_end: string
          p_cutoff_start: string
          p_records: Json
          p_request_id: string
        }
        Returns: Json
      }
      bulk_mark_payroll_records_paid: {
        Args: {
          p_cutoff_end: string
          p_cutoff_start: string
          p_records: Json
          p_request_id: string
        }
        Returns: Json
      }
      cache_rider_face_descriptor: {
        Args: { p_descriptor: Json; p_rider_id: string }
        Returns: undefined
      }
      calculate_distance: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      cancel_future_attendance_policy: {
        Args: { p_change_reason: string; p_policy_id: string }
        Returns: string
      }
      create_payroll_adjustments_batch: {
        Args: { p_items: Json; p_reason: string; p_rider_id: string }
        Returns: Json
      }
      create_payroll_deduction_obligation: {
        Args: {
          p_adjustment_code: string
          p_adjustment_date: string
          p_original_amount: number
          p_reason: string
          p_reference?: string
          p_rider_id: string
        }
        Returns: string
      }
      delete_draft_payroll_record: {
        Args: { p_payroll_record_id: string; p_reason: string }
        Returns: undefined
      }
      deploy_rider_temporarily: {
        Args: {
          p_end_date: string
          p_reason: string
          p_rider_id: string
          p_start_date: string
          p_target_hub_id: string
          p_target_zone_id: string
        }
        Returns: string
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      end_rider_deployment_early: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: undefined
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      execute_payroll_bulk_transition: {
        Args: {
          p_cutoff_end: string
          p_cutoff_start: string
          p_operation: string
          p_records: Json
          p_request_id: string
        }
        Returns: Json
      }
      extend_rider_deployment: {
        Args: {
          p_assignment_id: string
          p_new_end_date: string
          p_reason: string
        }
        Returns: undefined
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_executive_analytics_summary: {
        Args: { p_end_date?: string; p_start_date?: string; p_zone_id?: string }
        Returns: Json
      }
      get_hub_management_snapshot: { Args: never; Returns: Json }
      get_my_rider_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_payroll_eligible_rider_ids: {
        Args: { p_cutoff_end: string; p_cutoff_start: string }
        Returns: {
          rider_id: string
        }[]
      }
      get_rider_assignment_workspace: {
        Args: { p_hub_id?: string; p_rider_id?: string }
        Returns: Json
      }
      get_rider_route_summary: {
        Args: { p_date?: string; p_rider_id: string }
        Returns: Json
      }
      get_rider_workforce_directory: {
        Args: never
        Returns: {
          archive_effective_date: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          hub_id: string
          id: string
          mkb_id: string
          name: string
          restored_at: string
          zone_id: string
          zone_name: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      is_point_in_polygon: {
        Args: { p_lat: number; p_lng: number; polygon_coords: Json }
        Returns: boolean
      }
      is_rider_account_operational: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_rider_employed_on: {
        Args: { p_business_date: string; p_rider_id: string }
        Returns: boolean
      }
      is_rider_operational_at: {
        Args: { p_event_time: string; p_rider_id: string }
        Returns: boolean
      }
      is_user_currently_employed: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      refresh_rider_assignment_statuses: { Args: never; Returns: number }
      refresh_stale_rider_statuses: {
        Args: { stale_after?: string }
        Returns: number
      }
      save_payroll_adjustment_plan: {
        Args: {
          p_allocations: Json
          p_earnings: Json
          p_payroll_record_id: string
          p_reason: string
        }
        Returns: undefined
      }
      schedule_attendance_policy: {
        Args: {
          p_change_reason: string
          p_effective_from: string
          p_late_threshold: string
        }
        Returns: string
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      transfer_rider_permanently: {
        Args: {
          p_effective_date: string
          p_reason: string
          p_rider_id: string
          p_target_hub_id: string
          p_target_zone_id: string
        }
        Returns: string
      }
      transition_employee_lifecycle: {
        Args: {
          p_action: string
          p_actor_id: string
          p_effective_date: string
          p_reason: string
          p_remarks: string
          p_request_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      transition_employee_lifecycle_authorized_internal: {
        Args: {
          p_action: string
          p_actor_id: string
          p_effective_date: string
          p_reason: string
          p_remarks: string
          p_request_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      transition_rider_account_access: {
        Args: {
          p_action: string
          p_actor_id: string
          p_request_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      transition_rider_account_access_authorized_internal: {
        Args: {
          p_action: string
          p_actor_id: string
          p_request_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_my_last_login: { Args: never; Returns: undefined }
      update_payroll_adjustment_definition: {
        Args: {
          p_active: boolean
          p_code: string
          p_display_name: string
          p_reason: string
        }
        Returns: undefined
      }
      update_payroll_deduction_obligation: {
        Args: {
          p_adjustment_date: string
          p_obligation_id: string
          p_original_amount: number
          p_reason: string
          p_reference?: string
        }
        Returns: undefined
      }
      update_payroll_earning_adjustment: {
        Args: {
          p_adjustment_date: string
          p_adjustment_id: string
          p_amount: number
          p_reason: string
          p_reference?: string
        }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      validate_and_register_device: {
        Args: {
          p_device_name: string
          p_device_uuid: string
          p_fingerprint_hash: string
          p_ip: string
          p_platform: string
          p_user_agent: string
        }
        Returns: Json
      }
      validate_finalized_payroll_snapshot: {
        Args: { p_record_id: string }
        Returns: string
      }
      void_payroll_deduction_obligation: {
        Args: { p_obligation_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      attendance_source: "face-scan" | "manual" | "system"
      attendance_status: "present" | "late" | "absent" | "on_leave"
      device_status: "trusted" | "revoked"
      employment_status: "active" | "archived"
      notification_category:
        | "attendance"
        | "payroll"
        | "geofence"
        | "biometrics"
        | "account"
        | "system"
        | "announcement"
      notification_priority: "low" | "medium" | "high" | "critical"
      notification_type: "violation" | "absent" | "attendance" | "system"
      payroll_adjustment_source: "manual" | "legacy_migration"
      payroll_status:
        | "pending"
        | "processed"
        | "flagged"
        | "approved"
        | "paid"
        | "rejected"
        | "draft"
      rider_status: "active" | "idle" | "violation" | "offline"
      shift_type: "Morning" | "Afternoon" | "Evening"
      support_ticket_category:
        | "account_login"
        | "attendance"
        | "payroll"
        | "parcel_operations"
        | "geofence_location"
        | "technical_issue"
        | "other"
      support_ticket_status: "open" | "in_progress" | "resolved"
      user_role: "admin" | "hr" | "rider" | "payroll"
      user_status: "active" | "suspended"
      violation_type: "boundary_exit" | "idle_timeout" | "manual_flag"
      zone_status: "active" | "inactive"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      attendance_source: ["face-scan", "manual", "system"],
      attendance_status: ["present", "late", "absent", "on_leave"],
      device_status: ["trusted", "revoked"],
      employment_status: ["active", "archived"],
      notification_category: [
        "attendance",
        "payroll",
        "geofence",
        "biometrics",
        "account",
        "system",
        "announcement",
      ],
      notification_priority: ["low", "medium", "high", "critical"],
      notification_type: ["violation", "absent", "attendance", "system"],
      payroll_adjustment_source: ["manual", "legacy_migration"],
      payroll_status: [
        "pending",
        "processed",
        "flagged",
        "approved",
        "paid",
        "rejected",
        "draft",
      ],
      rider_status: ["active", "idle", "violation", "offline"],
      shift_type: ["Morning", "Afternoon", "Evening"],
      support_ticket_category: [
        "account_login",
        "attendance",
        "payroll",
        "parcel_operations",
        "geofence_location",
        "technical_issue",
        "other",
      ],
      support_ticket_status: ["open", "in_progress", "resolved"],
      user_role: ["admin", "hr", "rider", "payroll"],
      user_status: ["active", "suspended"],
      violation_type: ["boundary_exit", "idle_timeout", "manual_flag"],
      zone_status: ["active", "inactive"],
    },
  },
} as const
