// ══════════════════════════════════════════
// Auto-generated types — run `npm run db:types` to refresh
// Manual placeholder until Supabase CLI generates them
// ══════════════════════════════════════════

export type UserRole = "player" | "coach" | "admin";
export type PlayingLevel = "beginner" | "intermediate" | "advanced" | "professional";
export type GroupLevel = "beginner" | "intermediate" | "advanced" | "mixed";
export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";
export type PaymentMethod = "instapay" | "bank_transfer" | "vodafone_cash" | "cash";
export type PaymentStatus = "pending" | "confirmed" | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          role: UserRole;
          area: string | null;
          playing_level: PlayingLevel | null;
          training_goals: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["packages"]["Row"], "id" | "created_at" | "updated_at" | "sort_order"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["packages"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["groups"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["groups"]["Insert"]>;
      };
      group_players: {
        Row: {
          id: string;
          group_id: string;
          player_id: string;
          joined_at: string;
          is_active: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["group_players"]["Row"], "id"> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["group_players"]["Insert"]>;
      };
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
