export interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  level: string;
  max_players: number;
  is_active: boolean;
}

export interface GroupPlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  playing_level: string | null;
  sessions_remaining: number | null;
  joined_at: string;
}

export interface CoachRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  is_primary: boolean;
  assigned_at: string;
}

export interface ScheduleRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  coach_id: string | null;
  coach_name: string | null;
}

export interface AvailablePlayer {
  id: string;
  first_name: string;
  last_name: string;
  playing_level: string | null;
}

export interface AvailableCoach {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}
