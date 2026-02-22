export interface PlayerProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  area: string | null;
  playing_level: string | null;
  training_goals: string | null;
  health_conditions: string | null;
  height: number | null;
  weight: number | null;
  preferred_hand: string | null;
  preferred_position: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  status: string;
  sessions_remaining: number;
  sessions_total: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  packages: { name: string; session_count: number; price: number } | null;
}

export interface PaymentRow {
  id: string;
  subscription_id: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  session_date: string;
  session_time: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  group: { name: string } | null;
  marked_by_profile: { first_name: string; last_name: string } | null;
}

export interface FeedbackRow {
  id: string;
  session_date: string;
  rating: number;
  comment: string | null;
  created_at: string;
  coach: { first_name: string; last_name: string } | null;
}
