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
    PostgrestVersion: '14.17'
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          caption: string | null
          client_id: string | null
          created_at: string
          id: string
          is_client_visible: boolean
          job_id: string | null
          mime_type: string
          organization_id: string
          property_id: string | null
          quote_id: string | null
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          visit_id: string | null
        }
        Insert: {
          caption?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_client_visible?: boolean
          job_id?: string | null
          mime_type: string
          organization_id: string
          property_id?: string | null
          quote_id?: string | null
          size_bytes: number
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          caption?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_client_visible?: boolean
          job_id?: string | null
          mime_type?: string
          organization_id?: string
          property_id?: string | null
          quote_id?: string | null
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'attachments_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'attachments_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attachments_organization_id_job_id_fkey'
            columns: ['organization_id', 'job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'attachments_organization_id_property_id_fkey'
            columns: ['organization_id', 'property_id']
            isOneToOne: false
            referencedRelation: 'properties'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'attachments_organization_id_quote_id_fkey'
            columns: ['organization_id', 'quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'attachments_organization_id_visit_id_fkey'
            columns: ['organization_id', 'visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          organization_id: string
          phone: string | null
          receives_invoices: boolean
          role: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          organization_id: string
          phone?: string | null
          receives_invoices?: boolean
          role?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          receives_invoices?: boolean
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'client_contacts_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'client_contacts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      client_portal_users: {
        Row: {
          client_id: string
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'client_portal_users_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'client_portal_users_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_country: string | null
          billing_postal_code: string | null
          billing_region: string | null
          company_name: string | null
          created_at: string
          display_name: string
          email: string | null
          first_name: string | null
          id: string
          kind: Database['public']['Enums']['client_kind']
          last_name: string | null
          lead_source: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          status: Database['public']['Enums']['client_status']
          stripe_customer_id: string | null
          tags: string[]
          tax_exempt: boolean
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_postal_code?: string | null
          billing_region?: string | null
          company_name?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          first_name?: string | null
          id?: string
          kind?: Database['public']['Enums']['client_kind']
          last_name?: string | null
          lead_source?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          status?: Database['public']['Enums']['client_status']
          stripe_customer_id?: string | null
          tags?: string[]
          tax_exempt?: boolean
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_postal_code?: string | null
          billing_region?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          first_name?: string | null
          id?: string
          kind?: Database['public']['Enums']['client_kind']
          last_name?: string | null
          lead_source?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          status?: Database['public']['Enums']['client_status']
          stripe_customer_id?: string | null
          tags?: string[]
          tax_exempt?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      crew_members: {
        Row: {
          created_at: string
          crew_id: string
          is_lead: boolean
          member_id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          is_lead?: boolean
          member_id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          is_lead?: boolean
          member_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'crew_members_organization_id_crew_id_fkey'
            columns: ['organization_id', 'crew_id']
            isOneToOne: false
            referencedRelation: 'crews'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'crew_members_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'crew_members_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      crews: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          default_end_location: unknown
          default_start_location: unknown
          default_start_time: string
          id: string
          max_work_minutes: number | null
          name: string
          organization_id: string
          updated_at: string
          vehicle: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          default_end_location?: unknown
          default_start_location?: unknown
          default_start_time?: string
          id?: string
          max_work_minutes?: number | null
          name: string
          organization_id: string
          updated_at?: string
          vehicle?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          default_end_location?: unknown
          default_start_location?: unknown
          default_start_time?: string
          id?: string
          max_work_minutes?: number | null
          name?: string
          organization_id?: string
          updated_at?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'crews_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      document_sequences: {
        Row: {
          kind: Database['public']['Enums']['document_kind']
          next_value: number
          organization_id: string
        }
        Insert: {
          kind: Database['public']['Enums']['document_kind']
          next_value?: number
          organization_id: string
        }
        Update: {
          kind?: Database['public']['Enums']['document_kind']
          next_value?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'document_sequences_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_line_item_taxes: {
        Row: {
          amount_cents: number
          line_item_id: string
          organization_id: string
          percentage: number
          tax_rate_id: string
        }
        Insert: {
          amount_cents: number
          line_item_id: string
          organization_id: string
          percentage: number
          tax_rate_id: string
        }
        Update: {
          amount_cents?: number
          line_item_id?: string
          organization_id?: string
          percentage?: number
          tax_rate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_line_item_taxes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_line_item_taxes_organization_id_line_item_id_fkey'
            columns: ['organization_id', 'line_item_id']
            isOneToOne: false
            referencedRelation: 'invoice_line_items'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'invoice_line_item_taxes_organization_id_tax_rate_id_fkey'
            columns: ['organization_id', 'tax_rate_id']
            isOneToOne: false
            referencedRelation: 'tax_rates'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount_cents: number | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          job_id: string | null
          organization_id: string
          position: number
          quantity: number
          service_id: string | null
          unit_price_cents: number
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          job_id?: string | null
          organization_id: string
          position: number
          quantity?: number
          service_id?: string | null
          unit_price_cents: number
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          job_id?: string | null
          organization_id?: string
          position?: number
          quantity?: number
          service_id?: string | null
          unit_price_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_line_items_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_line_items_organization_id_invoice_id_fkey'
            columns: ['organization_id', 'invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'invoice_line_items_organization_id_invoice_id_visit_id_fkey'
            columns: ['organization_id', 'invoice_id', 'visit_id']
            isOneToOne: false
            referencedRelation: 'invoice_visits'
            referencedColumns: ['organization_id', 'invoice_id', 'visit_id']
          },
          {
            foreignKeyName: 'invoice_line_items_organization_id_job_id_fkey'
            columns: ['organization_id', 'job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'invoice_line_items_organization_id_service_id_fkey'
            columns: ['organization_id', 'service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      invoice_visits: {
        Row: {
          created_at: string
          invoice_id: string
          is_void: boolean
          organization_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          is_void?: boolean
          organization_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          is_void?: boolean
          organization_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_visits_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_visits_organization_id_invoice_id_fkey'
            columns: ['organization_id', 'invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'invoice_visits_organization_id_visit_id_fkey'
            columns: ['organization_id', 'visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid_cents: number
          balance_cents: number | null
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          internal_notes: string | null
          issue_date: string | null
          message: string | null
          number: string
          organization_id: string
          paid_at: string | null
          payment_link_token_hash: string | null
          period_end: string | null
          period_start: string | null
          sent_at: string | null
          status: Database['public']['Enums']['invoice_status']
          stripe_invoice_id: string | null
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount_paid_cents?: number
          balance_cents?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          issue_date?: string | null
          message?: string | null
          number: string
          organization_id: string
          paid_at?: string | null
          payment_link_token_hash?: string | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          status?: Database['public']['Enums']['invoice_status']
          stripe_invoice_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          terms?: string | null
          total_cents?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_paid_cents?: number
          balance_cents?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          issue_date?: string | null
          message?: string | null
          number?: string
          organization_id?: string
          paid_at?: string | null
          payment_link_token_hash?: string | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          status?: Database['public']['Enums']['invoice_status']
          stripe_invoice_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          terms?: string | null
          total_cents?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'invoices_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      job_line_item_taxes: {
        Row: {
          line_item_id: string
          organization_id: string
          tax_rate_id: string
        }
        Insert: {
          line_item_id: string
          organization_id: string
          tax_rate_id: string
        }
        Update: {
          line_item_id?: string
          organization_id?: string
          tax_rate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'job_line_item_taxes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'job_line_item_taxes_organization_id_line_item_id_fkey'
            columns: ['organization_id', 'line_item_id']
            isOneToOne: false
            referencedRelation: 'job_line_items'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'job_line_item_taxes_organization_id_tax_rate_id_fkey'
            columns: ['organization_id', 'tax_rate_id']
            isOneToOne: false
            referencedRelation: 'tax_rates'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      job_line_items: {
        Row: {
          amount_cents: number | null
          created_at: string
          description: string
          id: string
          job_id: string
          organization_id: string
          position: number
          quantity: number
          service_id: string | null
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          description: string
          id?: string
          job_id: string
          organization_id: string
          position: number
          quantity?: number
          service_id?: string | null
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          description?: string
          id?: string
          job_id?: string
          organization_id?: string
          position?: number
          quantity?: number
          service_id?: string | null
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'job_line_items_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'job_line_items_organization_id_job_id_fkey'
            columns: ['organization_id', 'job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'job_line_items_organization_id_service_id_fkey'
            columns: ['organization_id', 'service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      jobs: {
        Row: {
          billing_mode: Database['public']['Enums']['job_billing_mode']
          billing_period: Database['public']['Enums']['billing_period'] | null
          client_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          generated_through: string | null
          id: string
          instructions: string | null
          internal_notes: string | null
          kind: Database['public']['Enums']['job_kind']
          number: string
          organization_id: string
          preferred_crew_id: string | null
          property_id: string
          quote_id: string | null
          rrule: string | null
          start_date: string
          status: Database['public']['Enums']['job_status']
          title: string
          updated_at: string
          visit_duration_minutes: number
          window_minutes: number | null
          window_start: string | null
        }
        Insert: {
          billing_mode?: Database['public']['Enums']['job_billing_mode']
          billing_period?: Database['public']['Enums']['billing_period'] | null
          client_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          generated_through?: string | null
          id?: string
          instructions?: string | null
          internal_notes?: string | null
          kind?: Database['public']['Enums']['job_kind']
          number: string
          organization_id: string
          preferred_crew_id?: string | null
          property_id: string
          quote_id?: string | null
          rrule?: string | null
          start_date: string
          status?: Database['public']['Enums']['job_status']
          title: string
          updated_at?: string
          visit_duration_minutes?: number
          window_minutes?: number | null
          window_start?: string | null
        }
        Update: {
          billing_mode?: Database['public']['Enums']['job_billing_mode']
          billing_period?: Database['public']['Enums']['billing_period'] | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          generated_through?: string | null
          id?: string
          instructions?: string | null
          internal_notes?: string | null
          kind?: Database['public']['Enums']['job_kind']
          number?: string
          organization_id?: string
          preferred_crew_id?: string | null
          property_id?: string
          quote_id?: string | null
          rrule?: string | null
          start_date?: string
          status?: Database['public']['Enums']['job_status']
          title?: string
          updated_at?: string
          visit_duration_minutes?: number
          window_minutes?: number | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'jobs_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'jobs_organization_id_client_id_property_id_fkey'
            columns: ['organization_id', 'client_id', 'property_id']
            isOneToOne: false
            referencedRelation: 'properties'
            referencedColumns: ['organization_id', 'client_id', 'id']
          },
          {
            foreignKeyName: 'jobs_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'jobs_organization_id_preferred_crew_id_fkey'
            columns: ['organization_id', 'preferred_crew_id']
            isOneToOne: false
            referencedRelation: 'crews'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'jobs_organization_id_quote_id_fkey'
            columns: ['organization_id', 'quote_id']
            isOneToOne: true
            referencedRelation: 'quotes'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      member_pay_rates: {
        Row: {
          created_at: string
          effective_from: string
          hourly_rate_cents: number
          id: string
          member_id: string
          notes: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          hourly_rate_cents: number
          id?: string
          member_id: string
          notes?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          hourly_rate_cents?: number
          id?: string
          member_id?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'member_pay_rates_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_pay_rates_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      optimization_run_payloads: {
        Row: {
          organization_id: string
          request: Json | null
          response: Json | null
          run_id: string
        }
        Insert: {
          organization_id: string
          request?: Json | null
          response?: Json | null
          run_id: string
        }
        Update: {
          organization_id?: string
          request?: Json | null
          response?: Json | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'optimization_run_payloads_organization_id_run_id_fkey'
            columns: ['organization_id', 'run_id']
            isOneToOne: true
            referencedRelation: 'optimization_runs'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      optimization_runs: {
        Row: {
          created_at: string
          crew_ids: string[]
          error: string | null
          finished_at: string | null
          id: string
          organization_id: string
          provider: string
          requested_by: string | null
          route_date: string
          started_at: string | null
          status: Database['public']['Enums']['optimization_status']
          unassigned_visit_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_ids?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          organization_id: string
          provider: string
          requested_by?: string | null
          route_date: string
          started_at?: string | null
          status?: Database['public']['Enums']['optimization_status']
          unassigned_visit_ids?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_ids?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          organization_id?: string
          provider?: string
          requested_by?: string | null
          route_date?: string
          started_at?: string | null
          status?: Database['public']['Enums']['optimization_status']
          unassigned_visit_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'optimization_runs_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          member_id: string | null
          organization_id: string
          role: Database['public']['Enums']['org_role']
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          member_id?: string | null
          organization_id: string
          role?: Database['public']['Enums']['org_role']
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          member_id?: string | null
          organization_id?: string
          role?: Database['public']['Enums']['org_role']
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'organization_invitations_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'organization_invitations_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      organization_members: {
        Row: {
          color: string | null
          created_at: string
          display_name: string
          email: string | null
          home_location: unknown
          id: string
          organization_id: string
          phone: string | null
          role: Database['public']['Enums']['org_role']
          status: Database['public']['Enums']['member_status']
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          home_location?: unknown
          id?: string
          organization_id: string
          phone?: string | null
          role?: Database['public']['Enums']['org_role']
          status?: Database['public']['Enums']['member_status']
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          home_location?: unknown
          id?: string
          organization_id?: string
          phone?: string | null
          role?: Database['public']['Enums']['org_role']
          status?: Database['public']['Enums']['member_status']
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          logo_path: string | null
          name: string
          phone: string | null
          postal_code: string | null
          region: string | null
          settings: Json
          slug: string
          stripe_account_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          logo_path?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          settings?: Json
          slug: string
          stripe_account_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          settings?: Json
          slug?: string
          stripe_account_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          id: string
          invoice_id: string
          method: Database['public']['Enums']['payment_method']
          notes: string | null
          organization_id: string
          received_at: string
          recorded_by: string | null
          reference: string | null
          refunded_cents: number
          status: Database['public']['Enums']['payment_status']
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          id?: string
          invoice_id: string
          method: Database['public']['Enums']['payment_method']
          notes?: string | null
          organization_id: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          refunded_cents?: number
          status?: Database['public']['Enums']['payment_status']
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database['public']['Enums']['payment_method']
          notes?: string | null
          organization_id?: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          refunded_cents?: number
          status?: Database['public']['Enums']['payment_status']
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_organization_id_client_id_invoice_id_fkey'
            columns: ['organization_id', 'client_id', 'invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['organization_id', 'client_id', 'id']
          },
          {
            foreignKeyName: 'payments_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          access_notes: string | null
          address_line1: string
          address_line2: string | null
          archived_at: string | null
          city: string
          client_id: string
          country: string
          created_at: string
          geocode_source: string | null
          geocoded_at: string | null
          id: string
          latitude: number | null
          location: unknown
          longitude: number | null
          lot_size_sqft: number | null
          name: string | null
          organization_id: string
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address_line1: string
          address_line2?: string | null
          archived_at?: string | null
          city: string
          client_id: string
          country?: string
          created_at?: string
          geocode_source?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          lot_size_sqft?: number | null
          name?: string | null
          organization_id: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address_line1?: string
          address_line2?: string | null
          archived_at?: string | null
          city?: string
          client_id?: string
          country?: string
          created_at?: string
          geocode_source?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          lot_size_sqft?: number | null
          name?: string | null
          organization_id?: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'properties_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'properties_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      quote_line_item_taxes: {
        Row: {
          amount_cents: number
          line_item_id: string
          organization_id: string
          percentage: number
          tax_rate_id: string
        }
        Insert: {
          amount_cents: number
          line_item_id: string
          organization_id: string
          percentage: number
          tax_rate_id: string
        }
        Update: {
          amount_cents?: number
          line_item_id?: string
          organization_id?: string
          percentage?: number
          tax_rate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quote_line_item_taxes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quote_line_item_taxes_organization_id_line_item_id_fkey'
            columns: ['organization_id', 'line_item_id']
            isOneToOne: false
            referencedRelation: 'quote_line_items'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'quote_line_item_taxes_organization_id_tax_rate_id_fkey'
            columns: ['organization_id', 'tax_rate_id']
            isOneToOne: false
            referencedRelation: 'tax_rates'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      quote_line_items: {
        Row: {
          amount_cents: number | null
          created_at: string
          description: string
          frequency: Database['public']['Enums']['service_frequency']
          id: string
          is_optional: boolean
          is_selected: boolean
          organization_id: string
          position: number
          quantity: number
          quote_id: string
          season_end_month: number | null
          season_start_month: number | null
          service_id: string | null
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          description: string
          frequency?: Database['public']['Enums']['service_frequency']
          id?: string
          is_optional?: boolean
          is_selected?: boolean
          organization_id: string
          position: number
          quantity?: number
          quote_id: string
          season_end_month?: number | null
          season_start_month?: number | null
          service_id?: string | null
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          description?: string
          frequency?: Database['public']['Enums']['service_frequency']
          id?: string
          is_optional?: boolean
          is_selected?: boolean
          organization_id?: string
          position?: number
          quantity?: number
          quote_id?: string
          season_end_month?: number | null
          season_start_month?: number | null
          service_id?: string | null
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quote_line_items_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quote_line_items_organization_id_quote_id_fkey'
            columns: ['organization_id', 'quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'quote_line_items_organization_id_service_id_fkey'
            columns: ['organization_id', 'service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      quote_messages: {
        Row: {
          body: string
          client_message_id: string
          created_at: string
          id: string
          organization_id: string
          quote_id: string
          sender_kind: string
          staff_user_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          client_message_id: string
          created_at?: string
          id?: string
          organization_id: string
          quote_id: string
          sender_kind: string
          staff_user_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          client_message_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          quote_id?: string
          sender_kind?: string
          staff_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quote_messages_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quote_messages_quote_fkey'
            columns: ['organization_id', 'quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      quote_share_tokens: {
        Row: {
          created_at: string
          delivery_attempts: number
          delivery_status: Database['public']['Enums']['quote_delivery_status']
          expires_at: string
          id: string
          last_delivery_error: string | null
          organization_id: string
          quote_id: string
          resend_message_id: string | null
          revoked_at: string | null
          token_hash: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          delivery_attempts?: number
          delivery_status?: Database['public']['Enums']['quote_delivery_status']
          expires_at: string
          id?: string
          last_delivery_error?: string | null
          organization_id: string
          quote_id: string
          resend_message_id?: string | null
          revoked_at?: string | null
          token_hash: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          delivery_attempts?: number
          delivery_status?: Database['public']['Enums']['quote_delivery_status']
          expires_at?: string
          id?: string
          last_delivery_error?: string | null
          organization_id?: string
          quote_id?: string
          resend_message_id?: string | null
          revoked_at?: string | null
          token_hash?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'quote_share_tokens_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quote_share_tokens_organization_id_quote_id_fkey'
            columns: ['organization_id', 'quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          client_id: string
          conditions: string | null
          created_at: string
          created_by: string | null
          declined_reason: string | null
          id: string
          internal_notes: string | null
          message: string | null
          number: string
          organization_id: string
          property_id: string | null
          request_id: string | null
          revision: number | null
          sent_at: string | null
          status: Database['public']['Enums']['quote_status']
          subtotal_cents: number
          tax_cents: number
          title: string
          total_cents: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          client_id: string
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          declined_reason?: string | null
          id?: string
          internal_notes?: string | null
          message?: string | null
          number: string
          organization_id: string
          property_id?: string | null
          request_id?: string | null
          revision?: number | null
          sent_at?: string | null
          status?: Database['public']['Enums']['quote_status']
          subtotal_cents?: number
          tax_cents?: number
          title: string
          total_cents?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          client_id?: string
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          declined_reason?: string | null
          id?: string
          internal_notes?: string | null
          message?: string | null
          number?: string
          organization_id?: string
          property_id?: string | null
          request_id?: string | null
          revision?: number | null
          sent_at?: string | null
          status?: Database['public']['Enums']['quote_status']
          subtotal_cents?: number
          tax_cents?: number
          title?: string
          total_cents?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'quotes_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'quotes_organization_id_client_id_property_id_fkey'
            columns: ['organization_id', 'client_id', 'property_id']
            isOneToOne: false
            referencedRelation: 'properties'
            referencedColumns: ['organization_id', 'client_id', 'id']
          },
          {
            foreignKeyName: 'quotes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quotes_request_fkey'
            columns: ['organization_id', 'request_id']
            isOneToOne: false
            referencedRelation: 'requests'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      request_submission_log: {
        Row: {
          created_at: string
          id: number
          ip_hash: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          ip_hash: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: never
          ip_hash?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'request_submission_log_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      requests: {
        Row: {
          address: string
          client_id: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          id: string
          info_needed: string | null
          notes: string | null
          organization_id: string
          service_id: string
          source: Database['public']['Enums']['request_source']
          status: Database['public']['Enums']['request_status']
          submitted_at: string
          updated_at: string
        }
        Insert: {
          address: string
          client_id?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          info_needed?: string | null
          notes?: string | null
          organization_id: string
          service_id: string
          source?: Database['public']['Enums']['request_source']
          status?: Database['public']['Enums']['request_status']
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          address?: string
          client_id?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          info_needed?: string | null
          notes?: string | null
          organization_id?: string
          service_id?: string
          source?: Database['public']['Enums']['request_source']
          status?: Database['public']['Enums']['request_status']
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'requests_organization_id_client_id_fkey'
            columns: ['organization_id', 'client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'requests_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'requests_organization_id_service_id_fkey'
            columns: ['organization_id', 'service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      route_members: {
        Row: {
          created_at: string
          member_id: string
          organization_id: string
          route_date: string
          route_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          organization_id: string
          route_date: string
          route_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          organization_id?: string
          route_date?: string
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'route_members_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'route_members_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'route_members_organization_id_route_id_route_date_fkey'
            columns: ['organization_id', 'route_id', 'route_date']
            isOneToOne: false
            referencedRelation: 'routes'
            referencedColumns: ['organization_id', 'id', 'route_date']
          },
        ]
      }
      route_stops: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          organization_id: string
          planned_arrival: string | null
          planned_departure: string | null
          route_id: string
          sequence: number
          travel_distance_m: number | null
          travel_duration_s: number | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          organization_id: string
          planned_arrival?: string | null
          planned_departure?: string | null
          route_id: string
          sequence: number
          travel_distance_m?: number | null
          travel_duration_s?: number | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          organization_id?: string
          planned_arrival?: string | null
          planned_departure?: string | null
          route_id?: string
          sequence?: number
          travel_distance_m?: number | null
          travel_duration_s?: number | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'route_stops_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'route_stops_organization_id_route_id_fkey'
            columns: ['organization_id', 'route_id']
            isOneToOne: false
            referencedRelation: 'routes'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'route_stops_organization_id_visit_id_fkey'
            columns: ['organization_id', 'visit_id']
            isOneToOne: true
            referencedRelation: 'visits'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          crew_id: string
          end_location: unknown
          id: string
          optimization_run_id: string | null
          organization_id: string
          planned_end: string | null
          planned_start: string | null
          polyline: string | null
          published_at: string | null
          route_date: string
          start_location: unknown
          status: Database['public']['Enums']['route_status']
          total_distance_m: number | null
          total_duration_s: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          end_location?: unknown
          id?: string
          optimization_run_id?: string | null
          organization_id: string
          planned_end?: string | null
          planned_start?: string | null
          polyline?: string | null
          published_at?: string | null
          route_date: string
          start_location?: unknown
          status?: Database['public']['Enums']['route_status']
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          end_location?: unknown
          id?: string
          optimization_run_id?: string | null
          organization_id?: string
          planned_end?: string | null
          planned_start?: string | null
          polyline?: string | null
          published_at?: string | null
          route_date?: string
          start_location?: unknown
          status?: Database['public']['Enums']['route_status']
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'routes_organization_id_crew_id_fkey'
            columns: ['organization_id', 'crew_id']
            isOneToOne: false
            referencedRelation: 'crews'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'routes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'routes_organization_id_optimization_run_id_fkey'
            columns: ['organization_id', 'optimization_run_id']
            isOneToOne: false
            referencedRelation: 'optimization_runs'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      service_default_taxes: {
        Row: {
          organization_id: string
          service_id: string
          tax_rate_id: string
        }
        Insert: {
          organization_id: string
          service_id: string
          tax_rate_id: string
        }
        Update: {
          organization_id?: string
          service_id?: string
          tax_rate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'service_default_taxes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'service_default_taxes_organization_id_service_id_fkey'
            columns: ['organization_id', 'service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'service_default_taxes_organization_id_tax_rate_id_fkey'
            columns: ['organization_id', 'tax_rate_id']
            isOneToOne: false
            referencedRelation: 'tax_rates'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }

      service_regions: {
        Row: {
          boundary: unknown
          created_at: string
          crew_id: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          boundary: unknown
          created_at?: string
          crew_id?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          boundary?: unknown
          created_at?: string
          crew_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'service_regions_organization_id_crew_id_fkey'
            columns: ['organization_id', 'crew_id']
            isOneToOne: false
            referencedRelation: 'crews'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'service_regions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }

      services: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          default_duration_minutes: number | null
          default_price_cents: number
          description: string | null
          equipment: string[]
          frequencies: Database['public']['Enums']['service_frequency'][]
          id: string
          name: string
          organization_id: string
          precipitation_action: Database['public']['Enums']['service_precipitation_action']
          precipitation_type: Database['public']['Enums']['service_precipitation_type']
          season_end_month: number | null
          season_start_month: number | null
          unit: Database['public']['Enums']['service_unit']
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          default_duration_minutes?: number | null
          default_price_cents?: number
          description?: string | null
          equipment?: string[]
          frequencies?: Database['public']['Enums']['service_frequency'][]
          id?: string
          name: string
          organization_id: string
          precipitation_action?: Database['public']['Enums']['service_precipitation_action']
          precipitation_type?: Database['public']['Enums']['service_precipitation_type']
          season_end_month?: number | null
          season_start_month?: number | null
          unit?: Database['public']['Enums']['service_unit']
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          default_duration_minutes?: number | null
          default_price_cents?: number
          description?: string | null
          equipment?: string[]
          frequencies?: Database['public']['Enums']['service_frequency'][]
          id?: string
          name?: string
          organization_id?: string
          precipitation_action?: Database['public']['Enums']['service_precipitation_action']
          precipitation_type?: Database['public']['Enums']['service_precipitation_type']
          season_end_month?: number | null
          season_start_month?: number | null
          unit?: Database['public']['Enums']['service_unit']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'services_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      shifts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          member_id: string
          notes: string | null
          organization_id: string
          route_id: string | null
          source: Database['public']['Enums']['time_source']
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clock_in: string
          clock_out?: string | null
          created_at?: string
          id?: string
          member_id: string
          notes?: string | null
          organization_id: string
          route_id?: string | null
          source?: Database['public']['Enums']['time_source']
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          member_id?: string
          notes?: string | null
          organization_id?: string
          route_id?: string | null
          source?: Database['public']['Enums']['time_source']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'shifts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shifts_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'shifts_organization_id_route_id_fkey'
            columns: ['organization_id', 'route_id']
            isOneToOne: false
            referencedRelation: 'routes'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      stripe_events: {
        Row: {
          account_id: string | null
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          account_id?: string | null
          error?: string | null
          id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          account_id?: string | null
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          percentage: number
          registration_number: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          percentage: number
          registration_number?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          percentage?: number
          registration_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tax_rates_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      visit_time_entries: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          member_id: string
          organization_id: string
          source: Database['public']['Enums']['time_source']
          started_at: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          member_id: string
          organization_id: string
          source?: Database['public']['Enums']['time_source']
          started_at: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          member_id?: string
          organization_id?: string
          source?: Database['public']['Enums']['time_source']
          started_at?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visit_time_entries_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_time_entries_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'visit_time_entries_organization_id_visit_id_fkey'
            columns: ['organization_id', 'visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
      visits: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          completed_by_member_id: string | null
          completion_notes: string | null
          created_at: string
          duration_minutes: number
          id: string
          instructions: string | null
          is_exception: boolean
          job_id: string
          occurrence_date: string | null
          organization_id: string
          property_id: string
          scheduled_date: string | null
          status: Database['public']['Enums']['visit_status']
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          completed_by_member_id?: string | null
          completion_notes?: string | null
          created_at?: string
          duration_minutes: number
          id?: string
          instructions?: string | null
          is_exception?: boolean
          job_id: string
          occurrence_date?: string | null
          organization_id: string
          property_id: string
          scheduled_date?: string | null
          status?: Database['public']['Enums']['visit_status']
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          completed_by_member_id?: string | null
          completion_notes?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          instructions?: string | null
          is_exception?: boolean
          job_id?: string
          occurrence_date?: string | null
          organization_id?: string
          property_id?: string
          scheduled_date?: string | null
          status?: Database['public']['Enums']['visit_status']
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'visits_organization_id_completed_by_member_id_fkey'
            columns: ['organization_id', 'completed_by_member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'visits_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visits_organization_id_job_id_fkey'
            columns: ['organization_id', 'job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'visits_organization_id_property_id_fkey'
            columns: ['organization_id', 'property_id']
            isOneToOne: false
            referencedRelation: 'properties'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
    }
    Views: {
      labor_cost_report: {
        Row: {
          approved_at: string | null
          break_minutes: number | null
          clock_in: string | null
          clock_out: string | null
          display_name: string | null
          hourly_rate_cents: number | null
          hours: number | null
          labor_cost_cents: number | null
          member_id: string | null
          organization_id: string | null
          shift_id: string | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'shifts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shifts_organization_id_member_id_fkey'
            columns: ['organization_id', 'member_id']
            isOneToOne: false
            referencedRelation: 'organization_members'
            referencedColumns: ['organization_id', 'id']
          },
        ]
      }
    }
    Functions: {
      create_service_region: {
        Args: {
          p_organization_id: string
          p_name: string
          p_crew_id: string | null
          p_boundary: Json
        }
        Returns: string
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: {
          color: string | null
          created_at: string
          display_name: string
          email: string | null
          home_location: unknown
          id: string
          organization_id: string
          phone: string | null
          role: Database['public']['Enums']['org_role']
          status: Database['public']['Enums']['member_status']
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'organization_members'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_quote: {
        Args: { p_quote_id: string; p_selected_optional_line_ids?: string[] }
        Returns: undefined
      }
      create_invoice_for_visits: {
        Args: {
          p_client_id: string
          p_period_end?: string
          p_period_start?: string
          p_visit_ids: string[]
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_country?: string
          p_currency?: string
          p_name: string
          p_slug: string
          p_timezone?: string
        }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          logo_path: string | null
          name: string
          phone: string | null
          postal_code: string | null
          region: string | null
          settings: Json
          slug: string
          stripe_account_id: string | null
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: '*'
          to: 'organizations'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_quote_draft: {
        Args: { p_copy_from_quote_id?: string; p_request_id: string }
        Returns: string
      }
      decline_quote: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      generate_visits: {
        Args: { p_dates: string[]; p_job_id: string; p_through: string }
        Returns: number
      }
      get_portal: { Args: { p_slug: string }; Returns: Json }
      move_crew_member: {
        Args: {
          p_crew_id: string
          p_member_id: string
          p_organization_id: string
        }
        Returns: undefined
      }
      my_memberships: {
        Args: never
        Returns: {
          member_id: string
          organization_id: string
          organization_name: string
          organization_slug: string
          role: Database['public']['Enums']['org_role']
          status: Database['public']['Enums']['member_status']
        }[]
      }
      portal_invoice_lines: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_cents: number
          description: string
          line_item_id: string
          position: number
          quantity: number
          tax_cents: number
          unit_price_cents: number
        }[]
      }
      portal_my_clients: {
        Args: never
        Returns: {
          client_id: string
          display_name: string
          email: string
          organization_id: string
          organization_name: string
          phone: string
        }[]
      }
      portal_my_invoices: {
        Args: never
        Returns: {
          amount_paid_cents: number
          balance_cents: number
          client_id: string
          due_date: string
          invoice_id: string
          is_overdue: boolean
          issue_date: string
          message: string
          number: string
          paid_at: string
          period_end: string
          period_start: string
          sent_at: string
          status: Database['public']['Enums']['invoice_status']
          subtotal_cents: number
          tax_cents: number
          terms: string
          total_cents: number
        }[]
      }
      portal_my_jobs: {
        Args: never
        Returns: {
          client_id: string
          end_date: string
          job_id: string
          kind: Database['public']['Enums']['job_kind']
          number: string
          property_id: string
          start_date: string
          status: Database['public']['Enums']['job_status']
          title: string
        }[]
      }
      portal_my_payments: {
        Args: never
        Returns: {
          amount_cents: number
          invoice_id: string
          method: Database['public']['Enums']['payment_method']
          payment_id: string
          received_at: string
          refunded_cents: number
          status: Database['public']['Enums']['payment_status']
        }[]
      }
      portal_my_properties: {
        Args: never
        Returns: {
          access_notes: string
          address_line1: string
          address_line2: string
          city: string
          client_id: string
          name: string
          postal_code: string
          property_id: string
          region: string
        }[]
      }
      portal_my_quotes: {
        Args: never
        Returns: {
          approved_at: string
          client_id: string
          message: string
          number: string
          property_id: string
          quote_id: string
          sent_at: string
          status: Database['public']['Enums']['quote_status']
          subtotal_cents: number
          tax_cents: number
          title: string
          total_cents: number
          valid_until: string
        }[]
      }
      portal_my_visits: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          completed_at: string
          completion_notes: string
          job_id: string
          job_title: string
          property_id: string
          scheduled_date: string
          status: Database['public']['Enums']['visit_status']
          visit_id: string
          window_end: string
          window_start: string
        }[]
      }
      portal_quote_lines: {
        Args: { p_quote_id: string }
        Returns: {
          amount_cents: number
          description: string
          is_optional: boolean
          is_selected: boolean
          line_item_id: string
          position: number
          quantity: number
          tax_cents: number
          unit_price_cents: number
        }[]
      }
      portal_token_approve: {
        Args: { p_selected_optional_line_ids?: string[]; p_token_hash: string }
        Returns: undefined
      }
      portal_token_decline: {
        Args: { p_reason?: string; p_token_hash: string }
        Returns: undefined
      }
      portal_token_get_quote: { Args: { p_token_hash: string }; Returns: Json }
      portal_token_list_messages: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_token_hash: string
        }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_kind: string
        }[]
      }
      portal_token_post_message: {
        Args: {
          p_body: string
          p_client_message_id: string
          p_token_hash: string
        }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_kind: string
        }[]
      }
      post_quote_message: {
        Args: {
          p_body: string
          p_client_message_id: string
          p_organization_id: string
          p_quote_id: string
        }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_kind: string
        }[]
      }
      pull_back_quote: { Args: { p_quote_id: string }; Returns: undefined }
      record_quote_delivery: {
        Args: {
          p_error: string
          p_message_id: string
          p_status: Database['public']['Enums']['quote_delivery_status']
          p_token_id: string
        }
        Returns: undefined
      }
      reset_job_schedule: {
        Args: { p_from?: string; p_job_id: string }
        Returns: number
      }
      rotate_quote_token: {
        Args: { p_new_token_hash: string; p_quote_id: string }
        Returns: string
      }
      send_quote: {
        Args: { p_quote_id: string; p_token_hash: string }
        Returns: string
      }
      set_crew_lead: {
        Args: {
          p_crew_id: string
          p_member_id: string
          p_organization_id: string
        }
        Returns: undefined
      }
      submit_request: {
        Args: {
          p_address: string
          p_email: string
          p_ip_hash: string
          p_name: string
          p_notes: string
          p_phone: string
          p_service_id: string
          p_slug: string
        }
        Returns: string
      }
      worker_add_attachment: {
        Args: {
          p_caption?: string
          p_mime_type: string
          p_size_bytes: number
          p_storage_path: string
          p_visit_id: string
        }
        Returns: string
      }
      worker_clock_in: {
        Args: { p_organization_id: string; p_route_id?: string }
        Returns: string
      }
      worker_clock_out: {
        Args: { p_break_minutes?: number; p_organization_id: string }
        Returns: string
      }
      worker_complete_visit: {
        Args: { p_notes?: string; p_visit_id: string }
        Returns: undefined
      }
      worker_join_visit: { Args: { p_visit_id: string }; Returns: undefined }
      worker_mark_no_show: {
        Args: { p_notes?: string; p_visit_id: string }
        Returns: undefined
      }
      worker_my_routes: {
        Args: { p_date: string }
        Returns: {
          crew_id: string
          crew_name: string
          organization_id: string
          organization_name: string
          planned_end: string
          planned_start: string
          route_date: string
          route_id: string
          status: Database['public']['Enums']['route_status']
          stop_count: number
        }[]
      }
      worker_my_shifts: {
        Args: { p_from: string; p_to: string }
        Returns: {
          approved_at: string
          break_minutes: number
          clock_in: string
          clock_out: string
          organization_id: string
          route_id: string
          shift_id: string
        }[]
      }
      worker_route_stops: {
        Args: { p_route_id: string }
        Returns: {
          access_notes: string
          address_line1: string
          address_line2: string
          city: string
          client_name: string
          client_phone: string
          completion_notes: string
          duration_minutes: number
          job_id: string
          job_instructions: string
          job_title: string
          latitude: number
          longitude: number
          planned_arrival: string
          planned_departure: string
          postal_code: string
          price_cents: number
          property_id: string
          property_name: string
          region: string
          sequence: number
          stop_id: string
          visit_id: string
          visit_instructions: string
          visit_status: Database['public']['Enums']['visit_status']
          window_end: string
          window_start: string
        }[]
      }
      worker_start_visit: { Args: { p_visit_id: string }; Returns: undefined }
    }
    Enums: {
      billing_period: 'monthly'
      client_kind: 'individual' | 'company'
      client_status: 'lead' | 'active' | 'inactive'
      document_kind: 'quote' | 'job' | 'invoice'
      invoice_status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void'
      job_billing_mode: 'per_visit' | 'periodic'
      job_kind: 'one_off' | 'recurring'
      job_status: 'active' | 'on_hold' | 'completed' | 'cancelled'
      member_status: 'invited' | 'active' | 'disabled'
      optimization_status: 'queued' | 'running' | 'succeeded' | 'failed'
      org_role: 'owner' | 'admin' | 'dispatcher' | 'worker'
      payment_method: 'cash' | 'cheque' | 'etransfer' | 'card' | 'ach' | 'other'
      payment_status:
        'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'
      quote_delivery_status: 'pending' | 'sent' | 'failed'
      quote_status:
        'draft' | 'sent' | 'approved' | 'declined' | 'expired' | 'converted'
      request_source: 'web_form' | 'phone' | 'email' | 'client_portal'
      request_status:
        | 'submitted'
        | 'reviewing'
        | 'estimated'
        | 'approved'
        | 'rejected'
        | 'scheduled'
        | 'converted'
      route_status:
        'draft' | 'optimized' | 'published' | 'in_progress' | 'completed'
      service_frequency: 'one_time' | 'weekly' | 'biweekly' | 'monthly'
      service_precipitation_action: 'none' | 'schedule' | 'reschedule'
      service_precipitation_type: 'none' | 'rain' | 'snow' | 'any'
      service_unit:
        'monthly' | 'hour' | 'visit' | 'sqft' | 'linear_ft' | 'yard' | 'bag'
      time_source: 'app' | 'manual' | 'auto'
      visit_status:
        | 'unscheduled'
        | 'scheduled'
        | 'in_progress'
        | 'completed'
        | 'skipped'
        | 'cancelled'
        | 'no_show'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      billing_period: ['monthly'],
      client_kind: ['individual', 'company'],
      client_status: ['lead', 'active', 'inactive'],
      document_kind: ['quote', 'job', 'invoice'],
      invoice_status: ['draft', 'sent', 'partially_paid', 'paid', 'void'],
      job_billing_mode: ['per_visit', 'periodic'],
      job_kind: ['one_off', 'recurring'],
      job_status: ['active', 'on_hold', 'completed', 'cancelled'],
      member_status: ['invited', 'active', 'disabled'],
      optimization_status: ['queued', 'running', 'succeeded', 'failed'],
      org_role: ['owner', 'admin', 'dispatcher', 'worker'],
      payment_method: ['cash', 'cheque', 'etransfer', 'card', 'ach', 'other'],
      payment_status: [
        'pending',
        'succeeded',
        'failed',
        'refunded',
        'partially_refunded',
      ],
      quote_delivery_status: ['pending', 'sent', 'failed'],
      quote_status: [
        'draft',
        'sent',
        'approved',
        'declined',
        'expired',
        'converted',
      ],
      request_source: ['web_form', 'phone', 'email', 'client_portal'],
      request_status: [
        'submitted',
        'reviewing',
        'estimated',
        'approved',
        'rejected',
        'scheduled',
        'converted',
      ],
      route_status: [
        'draft',
        'optimized',
        'published',
        'in_progress',
        'completed',
      ],
      service_frequency: ['one_time', 'weekly', 'biweekly', 'monthly'],
      service_precipitation_action: ['none', 'schedule', 'reschedule'],
      service_precipitation_type: ['none', 'rain', 'snow', 'any'],
      service_unit: [
        'monthly',
        'hour',
        'visit',
        'sqft',
        'linear_ft',
        'yard',
        'bag',
      ],
      time_source: ['app', 'manual', 'auto'],
      visit_status: [
        'unscheduled',
        'scheduled',
        'in_progress',
        'completed',
        'skipped',
        'cancelled',
        'no_show',
      ],
    },
  },
} as const
