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
      availability_calendars: {
        Row: {
          created_at: string
          end_time: string
          id: string
          name: string
          saturday_end_time: string | null
          saturday_start_time: string | null
          start_time: string
          timezone: string
          updated_at: string
          working_days: number[]
        }
        Insert: {
          created_at?: string
          end_time?: string
          id?: string
          name: string
          saturday_end_time?: string | null
          saturday_start_time?: string | null
          start_time?: string
          timezone?: string
          updated_at?: string
          working_days?: number[]
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          saturday_end_time?: string | null
          saturday_start_time?: string | null
          start_time?: string
          timezone?: string
          updated_at?: string
          working_days?: number[]
        }
        Relationships: []
      }
      design_submissions: {
        Row: {
          designer_comment: string | null
          designer_id: string
          file_name: string
          file_path: string
          id: string
          parent_submission_id: string | null
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
          designer_comment?: string | null
          designer_id: string
          file_name: string
          file_path: string
          id?: string
          parent_submission_id?: string | null
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
          designer_comment?: string | null
          designer_id?: string
          file_name?: string
          file_path?: string
          id?: string
          parent_submission_id?: string | null
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
            foreignKeyName: "design_submissions_parent_submission_id_fkey"
            columns: ["parent_submission_id"]
            isOneToOne: false
            referencedRelation: "design_submissions"
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
      developers: {
        Row: {
          availability_calendar_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          round_robin_position: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          availability_calendar_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          round_robin_position: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          availability_calendar_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          round_robin_position?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developers_availability_calendar_id_fkey"
            columns: ["availability_calendar_id"]
            isOneToOne: false
            referencedRelation: "availability_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_records: {
        Row: {
          created_at: string
          created_by: string | null
          developer_id: string
          id: string
          leave_end_datetime: string
          leave_start_datetime: string
          reason: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          developer_id: string
          id?: string
          leave_end_datetime: string
          leave_start_datetime: string
          reason?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          developer_id?: string
          id?: string
          leave_end_datetime?: string
          leave_start_datetime?: string
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_records_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "order_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          task_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "order_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          message: string
          parent_message_id: string | null
          sender_id: string
          status: string
          task_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          message: string
          parent_message_id?: string | null
          sender_id: string
          status?: string
          task_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          message?: string
          parent_message_id?: string | null
          sender_id?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "order_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_review_replies: {
        Row: {
          created_at: string
          file_names: string | null
          file_paths: string | null
          id: string
          message: string | null
          phase_review_id: string
          task_id: string
          user_id: string
          voice_path: string | null
        }
        Insert: {
          created_at?: string
          file_names?: string | null
          file_paths?: string | null
          id?: string
          message?: string | null
          phase_review_id: string
          task_id: string
          user_id: string
          voice_path?: string | null
        }
        Update: {
          created_at?: string
          file_names?: string | null
          file_paths?: string | null
          id?: string
          message?: string | null
          phase_review_id?: string
          task_id?: string
          user_id?: string
          voice_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phase_review_replies_phase_review_id_fkey"
            columns: ["phase_review_id"]
            isOneToOne: false
            referencedRelation: "phase_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_review_replies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_reviews: {
        Row: {
          change_comment: string | null
          change_completed_at: string | null
          change_completed_by: string | null
          change_deadline: string | null
          change_file_names: string | null
          change_file_paths: string | null
          change_severity: string | null
          created_at: string
          id: string
          phase_id: string
          review_comment: string | null
          review_file_names: string | null
          review_file_paths: string | null
          review_status: string
          review_voice_path: string | null
          reviewed_at: string
          reviewed_by: string
          round_number: number
          task_id: string
        }
        Insert: {
          change_comment?: string | null
          change_completed_at?: string | null
          change_completed_by?: string | null
          change_deadline?: string | null
          change_file_names?: string | null
          change_file_paths?: string | null
          change_severity?: string | null
          created_at?: string
          id?: string
          phase_id: string
          review_comment?: string | null
          review_file_names?: string | null
          review_file_paths?: string | null
          review_status: string
          review_voice_path?: string | null
          reviewed_at?: string
          reviewed_by: string
          round_number?: number
          task_id: string
        }
        Update: {
          change_comment?: string | null
          change_completed_at?: string | null
          change_completed_by?: string | null
          change_deadline?: string | null
          change_file_names?: string | null
          change_file_paths?: string | null
          change_severity?: string | null
          created_at?: string
          id?: string
          phase_id?: string
          review_comment?: string | null
          review_file_names?: string | null
          review_file_paths?: string | null
          review_status?: string
          review_voice_path?: string | null
          reviewed_at?: string
          reviewed_by?: string
          round_number?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_reviews_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_reviews_task_id_fkey"
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
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_phases: {
        Row: {
          change_comment: string | null
          change_completed_at: string | null
          change_completed_by: string | null
          change_deadline: string | null
          change_file_names: string | null
          change_file_paths: string | null
          change_severity: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          held_at: string | null
          held_by: string | null
          hold_reason: string | null
          id: string
          pages_completed: number
          phase_number: number
          points: number
          review_comment: string | null
          review_file_names: string | null
          review_file_paths: string | null
          review_status: string | null
          review_voice_path: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sla_deadline: string | null
          sla_hours: number
          started_at: string | null
          started_by: string | null
          status: string
          submission_comment: string | null
          submission_file_names: string | null
          submission_file_paths: string | null
          task_id: string
        }
        Insert: {
          change_comment?: string | null
          change_completed_at?: string | null
          change_completed_by?: string | null
          change_deadline?: string | null
          change_file_names?: string | null
          change_file_paths?: string | null
          change_severity?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string
          pages_completed?: number
          phase_number: number
          points?: number
          review_comment?: string | null
          review_file_names?: string | null
          review_file_paths?: string | null
          review_status?: string | null
          review_voice_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sla_deadline?: string | null
          sla_hours?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          submission_comment?: string | null
          submission_file_names?: string | null
          submission_file_paths?: string | null
          task_id: string
        }
        Update: {
          change_comment?: string | null
          change_completed_at?: string | null
          change_completed_by?: string | null
          change_deadline?: string | null
          change_file_names?: string | null
          change_file_paths?: string | null
          change_severity?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string
          pages_completed?: number
          phase_number?: number
          points?: number
          review_comment?: string | null
          review_file_names?: string | null
          review_file_paths?: string | null
          review_status?: string | null
          review_voice_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sla_deadline?: string | null
          sla_hours?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          submission_comment?: string | null
          submission_file_names?: string | null
          submission_file_paths?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      reassignment_history: {
        Row: {
          created_at: string
          from_developer_id: string | null
          id: string
          reason: string
          reassigned_by: string
          task_id: string
          to_developer_id: string
        }
        Insert: {
          created_at?: string
          from_developer_id?: string | null
          id?: string
          reason: string
          reassigned_by: string
          task_id: string
          to_developer_id: string
        }
        Update: {
          created_at?: string
          from_developer_id?: string | null
          id?: string
          reason?: string
          reassigned_by?: string
          task_id?: string
          to_developer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reassignment_history_from_developer_id_fkey"
            columns: ["from_developer_id"]
            isOneToOne: false
            referencedRelation: "developers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reassignment_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reassignment_history_to_developer_id_fkey"
            columns: ["to_developer_id"]
            isOneToOne: false
            referencedRelation: "developers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_performance_history: {
        Row: {
          archived_at: string
          closed_orders_count: number
          closed_revenue: number
          id: string
          month_year: string
          monthly_dollar_target: number
          monthly_order_target: number
          transferred_orders_count: number
          upsell_revenue: number
          user_id: string
        }
        Insert: {
          archived_at?: string
          closed_orders_count?: number
          closed_revenue?: number
          id?: string
          month_year: string
          monthly_dollar_target?: number
          monthly_order_target?: number
          transferred_orders_count?: number
          upsell_revenue?: number
          user_id: string
        }
        Update: {
          archived_at?: string
          closed_orders_count?: number
          closed_revenue?: number
          id?: string
          month_year?: string
          monthly_dollar_target?: number
          monthly_order_target?: number
          transferred_orders_count?: number
          upsell_revenue?: number
          user_id?: string
        }
        Relationships: []
      }
      sales_targets: {
        Row: {
          closed_orders_count: number
          closed_revenue: number
          created_at: string | null
          id: string
          monthly_dollar_target: number
          monthly_order_target: number
          transferred_orders_count: number
          updated_at: string | null
          upsell_revenue: number
          user_id: string
        }
        Insert: {
          closed_orders_count?: number
          closed_revenue?: number
          created_at?: string | null
          id?: string
          monthly_dollar_target?: number
          monthly_order_target?: number
          transferred_orders_count?: number
          updated_at?: string | null
          upsell_revenue?: number
          user_id: string
        }
        Update: {
          closed_orders_count?: number
          closed_revenue?: number
          created_at?: string | null
          id?: string
          monthly_dollar_target?: number
          monthly_order_target?: number
          transferred_orders_count?: number
          updated_at?: string | null
          upsell_revenue?: number
          user_id?: string
        }
        Relationships: []
      }
      task_delay_notifications: {
        Row: {
          created_at: string
          id: string
          notification_sent_at: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_sent_at?: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_sent_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_delay_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          accepted_by_pm: boolean
          ack_deadline: string | null
          acknowledged_at: string | null
          additional_details: string | null
          amount_paid: number | null
          amount_pending: number | null
          amount_total: number | null
          attachment_file_name: string | null
          attachment_file_path: string | null
          brand_colors: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          closed_by: string | null
          competitors_inspiration: string | null
          content_provided: boolean | null
          created_at: string | null
          created_by: string | null
          cta: string | null
          current_phase: number | null
          customer_domain: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          deadline: string | null
          description: string | null
          design_references: string | null
          design_style: string | null
          developer_id: string | null
          domain_hosting_status: string | null
          file_formats_needed: string | null
          fonts: string | null
          headline_main_text: string | null
          held_at: string | null
          held_by: string | null
          hold_reason: string | null
          id: string
          industry: string | null
          is_deleted: boolean
          is_upsell: boolean
          late_acknowledgement: boolean
          launch_access_method: string | null
          launch_delegate_status: string | null
          launch_dns_a_record: string | null
          launch_dns_cname: string | null
          launch_dns_mx_record: string | null
          launch_dns_status: string | null
          launch_domain: string | null
          launch_domain_password: string | null
          launch_domain_provider: string | null
          launch_domain_username: string | null
          launch_hosting_access_method: string | null
          launch_hosting_delegate_status: string | null
          launch_hosting_paid: number | null
          launch_hosting_password: string | null
          launch_hosting_pending: number | null
          launch_hosting_provider: string | null
          launch_hosting_provider_name: string | null
          launch_hosting_total: number | null
          launch_hosting_username: string | null
          launch_nameserver_1: string | null
          launch_nameserver_2: string | null
          launch_nameserver_3: string | null
          launch_nameserver_4: string | null
          launch_nameserver_status: string | null
          launch_self_launch_status: string | null
          launch_website_live_at: string | null
          launch_website_live_by: string | null
          launch_wetransfer_link: string | null
          logo_style: string | null
          logo_type: string | null
          logo_url: string | null
          notes_extra_instructions: string | null
          number_of_concepts: string | null
          number_of_pages: string | null
          number_of_revisions: string | null
          objective: string | null
          order_group_id: string | null
          platforms: string[] | null
          post_type: string | null
          post_type_required: string | null
          pricing: string | null
          product_service_description: string | null
          product_service_images: string | null
          product_service_name: string | null
          project_manager_id: string
          reassigned_at: string | null
          reassigned_from: string | null
          reassignment_reason: string | null
          reassignment_request_reason: string | null
          reassignment_requested_at: string | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["task_status"]
          supporting_text: string | null
          tagline: string | null
          target_attributed: boolean
          target_audience_age: string | null
          target_audience_interest: string | null
          target_audience_location: string | null
          target_audience_other: string | null
          task_number: number
          team_id: string
          title: string
          total_phases: number | null
          transferred_by: string | null
          updated_at: string | null
          upsell_completed_at: string | null
          upsell_notes: string | null
          upsell_status: string | null
          upsell_verified_at: string | null
          upsell_verified_by: string | null
          usage_type: string | null
          video_keywords: string | null
          website_deadline_type: string | null
          website_features: string | null
          website_type: string | null
          website_url: string | null
        }
        Insert: {
          accepted_by_pm?: boolean
          ack_deadline?: string | null
          acknowledged_at?: string | null
          additional_details?: string | null
          amount_paid?: number | null
          amount_pending?: number | null
          amount_total?: number | null
          attachment_file_name?: string | null
          attachment_file_path?: string | null
          brand_colors?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          closed_by?: string | null
          competitors_inspiration?: string | null
          content_provided?: boolean | null
          created_at?: string | null
          created_by?: string | null
          cta?: string | null
          current_phase?: number | null
          customer_domain?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deadline?: string | null
          description?: string | null
          design_references?: string | null
          design_style?: string | null
          developer_id?: string | null
          domain_hosting_status?: string | null
          file_formats_needed?: string | null
          fonts?: string | null
          headline_main_text?: string | null
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string
          industry?: string | null
          is_deleted?: boolean
          is_upsell?: boolean
          late_acknowledgement?: boolean
          launch_access_method?: string | null
          launch_delegate_status?: string | null
          launch_dns_a_record?: string | null
          launch_dns_cname?: string | null
          launch_dns_mx_record?: string | null
          launch_dns_status?: string | null
          launch_domain?: string | null
          launch_domain_password?: string | null
          launch_domain_provider?: string | null
          launch_domain_username?: string | null
          launch_hosting_access_method?: string | null
          launch_hosting_delegate_status?: string | null
          launch_hosting_paid?: number | null
          launch_hosting_password?: string | null
          launch_hosting_pending?: number | null
          launch_hosting_provider?: string | null
          launch_hosting_provider_name?: string | null
          launch_hosting_total?: number | null
          launch_hosting_username?: string | null
          launch_nameserver_1?: string | null
          launch_nameserver_2?: string | null
          launch_nameserver_3?: string | null
          launch_nameserver_4?: string | null
          launch_nameserver_status?: string | null
          launch_self_launch_status?: string | null
          launch_website_live_at?: string | null
          launch_website_live_by?: string | null
          launch_wetransfer_link?: string | null
          logo_style?: string | null
          logo_type?: string | null
          logo_url?: string | null
          notes_extra_instructions?: string | null
          number_of_concepts?: string | null
          number_of_pages?: string | null
          number_of_revisions?: string | null
          objective?: string | null
          order_group_id?: string | null
          platforms?: string[] | null
          post_type?: string | null
          post_type_required?: string | null
          pricing?: string | null
          product_service_description?: string | null
          product_service_images?: string | null
          product_service_name?: string | null
          project_manager_id: string
          reassigned_at?: string | null
          reassigned_from?: string | null
          reassignment_reason?: string | null
          reassignment_request_reason?: string | null
          reassignment_requested_at?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          supporting_text?: string | null
          tagline?: string | null
          target_attributed?: boolean
          target_audience_age?: string | null
          target_audience_interest?: string | null
          target_audience_location?: string | null
          target_audience_other?: string | null
          task_number?: number
          team_id: string
          title: string
          total_phases?: number | null
          transferred_by?: string | null
          updated_at?: string | null
          upsell_completed_at?: string | null
          upsell_notes?: string | null
          upsell_status?: string | null
          upsell_verified_at?: string | null
          upsell_verified_by?: string | null
          usage_type?: string | null
          video_keywords?: string | null
          website_deadline_type?: string | null
          website_features?: string | null
          website_type?: string | null
          website_url?: string | null
        }
        Update: {
          accepted_by_pm?: boolean
          ack_deadline?: string | null
          acknowledged_at?: string | null
          additional_details?: string | null
          amount_paid?: number | null
          amount_pending?: number | null
          amount_total?: number | null
          attachment_file_name?: string | null
          attachment_file_path?: string | null
          brand_colors?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          closed_by?: string | null
          competitors_inspiration?: string | null
          content_provided?: boolean | null
          created_at?: string | null
          created_by?: string | null
          cta?: string | null
          current_phase?: number | null
          customer_domain?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deadline?: string | null
          description?: string | null
          design_references?: string | null
          design_style?: string | null
          developer_id?: string | null
          domain_hosting_status?: string | null
          file_formats_needed?: string | null
          fonts?: string | null
          headline_main_text?: string | null
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string
          industry?: string | null
          is_deleted?: boolean
          is_upsell?: boolean
          late_acknowledgement?: boolean
          launch_access_method?: string | null
          launch_delegate_status?: string | null
          launch_dns_a_record?: string | null
          launch_dns_cname?: string | null
          launch_dns_mx_record?: string | null
          launch_dns_status?: string | null
          launch_domain?: string | null
          launch_domain_password?: string | null
          launch_domain_provider?: string | null
          launch_domain_username?: string | null
          launch_hosting_access_method?: string | null
          launch_hosting_delegate_status?: string | null
          launch_hosting_paid?: number | null
          launch_hosting_password?: string | null
          launch_hosting_pending?: number | null
          launch_hosting_provider?: string | null
          launch_hosting_provider_name?: string | null
          launch_hosting_total?: number | null
          launch_hosting_username?: string | null
          launch_nameserver_1?: string | null
          launch_nameserver_2?: string | null
          launch_nameserver_3?: string | null
          launch_nameserver_4?: string | null
          launch_nameserver_status?: string | null
          launch_self_launch_status?: string | null
          launch_website_live_at?: string | null
          launch_website_live_by?: string | null
          launch_wetransfer_link?: string | null
          logo_style?: string | null
          logo_type?: string | null
          logo_url?: string | null
          notes_extra_instructions?: string | null
          number_of_concepts?: string | null
          number_of_pages?: string | null
          number_of_revisions?: string | null
          objective?: string | null
          order_group_id?: string | null
          platforms?: string[] | null
          post_type?: string | null
          post_type_required?: string | null
          pricing?: string | null
          product_service_description?: string | null
          product_service_images?: string | null
          product_service_name?: string | null
          project_manager_id?: string
          reassigned_at?: string | null
          reassigned_from?: string | null
          reassignment_reason?: string | null
          reassignment_request_reason?: string | null
          reassignment_requested_at?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          supporting_text?: string | null
          tagline?: string | null
          target_attributed?: boolean
          target_audience_age?: string | null
          target_audience_interest?: string | null
          target_audience_location?: string | null
          target_audience_other?: string | null
          task_number?: number
          team_id?: string
          title?: string
          total_phases?: number | null
          transferred_by?: string | null
          updated_at?: string | null
          upsell_completed_at?: string | null
          upsell_notes?: string | null
          upsell_status?: string | null
          upsell_verified_at?: string | null
          upsell_verified_by?: string | null
          usage_type?: string | null
          video_keywords?: string | null
          website_deadline_type?: string | null
          website_features?: string | null
          website_type?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developers"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "tasks_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "team_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      website_order_assignment: {
        Row: {
          id: string
          last_assigned_index: number
          updated_at: string
        }
        Insert: {
          id?: string
          last_assigned_index?: number
          updated_at?: string
        }
        Update: {
          id?: string
          last_assigned_index?: number
          updated_at?: string
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
      get_next_available_developer: { Args: never; Returns: Json }
      get_next_developer_team: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_monthly_sales_targets: { Args: never; Returns: undefined }
      set_user_role_designer: { Args: never; Returns: undefined }
      set_user_role_developer: { Args: never; Returns: undefined }
      set_user_role_front_sales: { Args: never; Returns: undefined }
      validate_safe_filename: { Args: { filename: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "project_manager"
        | "designer"
        | "developer"
        | "front_sales"
        | "development_team_leader"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "approved"
        | "cancelled"
        | "assigned"
        | "on_hold"
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
      app_role: [
        "admin",
        "project_manager",
        "designer",
        "developer",
        "front_sales",
        "development_team_leader",
      ],
      task_status: [
        "pending",
        "in_progress",
        "completed",
        "approved",
        "cancelled",
        "assigned",
        "on_hold",
      ],
    },
  },
} as const
