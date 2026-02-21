// ══════════════════════════════════════════
// Auto-generated types — run `npm run db:types` to refresh
// Manual placeholder until Supabase CLI generates them
// ══════════════════════════════════════════

export type UserRole = "player" | "coach" | "admin";
export type PlayingLevel = "beginner" | "intermediate" | "advanced" | "professional";
export type GroupLevel = "beginner" | "intermediate" | "advanced" | "mixed";
export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";
export type PaymentMethod = "instapay" | "cash";
export type PaymentStatus = "pending" | "confirmed" | "rejected";
export type AttendanceStatus = "present" | "absent" | "excused";
export type RecurrenceType = "monthly" | "weekly";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string | null;
          phone: string | null;
          email: string | null;
          role: UserRole;
          area: string | null;
          playing_level: PlayingLevel | null;
          training_goals: string | null;
          health_conditions: string | null;
          preferred_package_id: string | null;
          avatar_url: string | null;
          is_active: boolean;
          profile_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth?: string | null;
          phone?: string | null;
          email?: string | null;
          role: UserRole;
          area?: string | null;
          playing_level?: PlayingLevel | null;
          training_goals?: string | null;
          health_conditions?: string | null;
          preferred_package_id?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          profile_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          date_of_birth?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: UserRole;
          area?: string | null;
          playing_level?: PlayingLevel | null;
          training_goals?: string | null;
          health_conditions?: string | null;
          preferred_package_id?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          profile_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      packages: {
        Row: {
          id: string;
          name: string;
          session_count: number;
          validity_days: number;
          price: number;
          description: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          session_count: number;
          validity_days: number;
          price: number;
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          session_count?: number;
          validity_days?: number;
          price?: number;
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          player_id: string;
          package_id: string;
          sessions_remaining: number;
          sessions_total: number;
          start_date: string | null;
          end_date: string | null;
          status: SubscriptionStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          package_id: string;
          sessions_remaining: number;
          sessions_total: number;
          start_date?: string | null;
          end_date?: string | null;
          status: SubscriptionStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          package_id?: string;
          sessions_remaining?: number;
          sessions_total?: number;
          start_date?: string | null;
          end_date?: string | null;
          status?: SubscriptionStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          player_id: string;
          subscription_id: string;
          amount: number;
          method: PaymentMethod;
          screenshot_url: string | null;
          status: PaymentStatus;
          confirmed_by: string | null;
          rejection_reason: string | null;
          confirmed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          subscription_id: string;
          amount: number;
          method: PaymentMethod;
          screenshot_url?: string | null;
          status?: PaymentStatus;
          confirmed_by?: string | null;
          rejection_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          subscription_id?: string;
          amount?: number;
          method?: PaymentMethod;
          screenshot_url?: string | null;
          status?: PaymentStatus;
          confirmed_by?: string | null;
          rejection_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          level: GroupLevel;
          max_players: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          level: GroupLevel;
          max_players: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          level?: GroupLevel;
          max_players?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      group_players: {
        Row: {
          id: string;
          group_id: string;
          player_id: string;
          joined_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          group_id: string;
          player_id: string;
          joined_at?: string;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          group_id?: string;
          player_id?: string;
          joined_at?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          player_id: string;
          group_id: string | null;
          session_date: string;
          session_time: string | null;
          status: AttendanceStatus;
          marked_by: string | null;
          notes: string | null;
          schedule_session_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          group_id?: string | null;
          session_date: string;
          session_time?: string | null;
          status?: AttendanceStatus;
          marked_by?: string | null;
          notes?: string | null;
          schedule_session_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          group_id?: string | null;
          session_date?: string;
          session_time?: string | null;
          status?: AttendanceStatus;
          marked_by?: string | null;
          notes?: string | null;
          schedule_session_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          player_id: string;
          coach_id: string;
          group_id: string | null;
          session_date: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          coach_id: string;
          group_id?: string | null;
          session_date: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          coach_id?: string;
          group_id?: string | null;
          session_date?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      coach_groups: {
        Row: {
          id: string;
          coach_id: string;
          group_id: string;
          is_primary: boolean;
          assigned_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          coach_id: string;
          group_id: string;
          is_primary?: boolean;
          assigned_at?: string;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          coach_id?: string;
          group_id?: string;
          is_primary?: boolean;
          assigned_at?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      schedule_sessions: {
        Row: {
          id: string;
          group_id: string;
          coach_id: string | null;
          day_of_week: number;
          start_time: string;
          end_time: string;
          location: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          coach_id?: string | null;
          day_of_week: number;
          start_time: string;
          end_time: string;
          location?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          coach_id?: string | null;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          location?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expense_categories: {
        Row: {
          id: string;
          name: string;
          icon: string | null;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          icon?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          category_id: string;
          description: string;
          amount: number;
          expense_date: string;
          is_recurring: boolean;
          recurrence_type: RecurrenceType | null;
          is_active: boolean;
          created_by: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          description: string;
          amount: number;
          expense_date: string;
          is_recurring?: boolean;
          recurrence_type?: RecurrenceType | null;
          is_active?: boolean;
          created_by: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          description?: string;
          amount?: number;
          expense_date?: string;
          is_recurring?: boolean;
          recurrence_type?: RecurrenceType | null;
          is_active?: boolean;
          created_by?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      log_attendance_with_deduction: {
        Args: {
          p_player_id: string;
          p_group_id: string;
          p_session_date: string;
          p_session_time: string;
          p_status: string;
          p_marked_by: string;
          p_schedule_session_id: string;
          p_notes?: string | null;
        };
        Returns: unknown;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ── Convenience types ──
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Package = Database["public"]["Tables"]["packages"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupPlayer = Database["public"]["Tables"]["group_players"]["Row"];
export type Attendance = Database["public"]["Tables"]["attendance"]["Row"];
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
export type CoachGroup = Database["public"]["Tables"]["coach_groups"]["Row"];
export type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];
export type ExpenseCategory = Database["public"]["Tables"]["expense_categories"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];

// ── Joined types for UI queries ──
export interface ScheduleSessionWithDetails extends ScheduleSession {
  group: Pick<Group, "id" | "name" | "level">;
  coach: Pick<Profile, "id" | "first_name" | "last_name"> | null;
}

export interface CoachGroupWithDetails extends CoachGroup {
  group: Pick<Group, "id" | "name" | "level" | "max_players">;
  player_count: number;
}

export interface AttendanceWithPlayer extends Attendance {
  player: Pick<Profile, "id" | "first_name" | "last_name" | "avatar_url">;
}

export interface GroupWithDetails extends Group {
  player_count: number;
  coaches: Pick<Profile, "id" | "first_name" | "last_name">[];
  schedule: ScheduleSession[];
}

export interface ExpenseWithCategory extends Expense {
  expense_categories: Pick<ExpenseCategory, "id" | "name" | "icon">;
}
