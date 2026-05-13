export type WhatsappVariable = {
  key: string;
  label: string;
  description: string;
  example: string;
};

export const VARIABLES: WhatsappVariable[] = [
  // Profile
  { key: 'first_name',    label: 'First name',    description: "Player's first name",      example: 'Ahmed' },
  { key: 'last_name',     label: 'Last name',     description: "Player's last name",       example: 'Hassan' },
  { key: 'full_name',     label: 'Full name',     description: 'First + last',             example: 'Ahmed Hassan' },
  { key: 'phone',         label: 'Phone',         description: "Player's phone",           example: '01XXXXXXXXX' },
  { key: 'email',         label: 'Email',         description: "Player's email",           example: 'ahmed@example.com' },
  { key: 'area',          label: 'Area',          description: 'Area of residence',        example: 'Maadi' },
  { key: 'playing_level', label: 'Playing level', description: 'beginner / intermediate / advanced / professional', example: 'intermediate' },
  { key: 'gender',        label: 'Gender',        description: 'male / female',            example: 'male' },
  { key: 'occupation',    label: 'Occupation',    description: 'Player occupation',        example: 'Engineer' },

  // Subscription
  { key: 'sessions_remaining',    label: 'Sessions remaining',    description: 'Sessions left in current subscription', example: '4' },
  { key: 'sessions_total',        label: 'Sessions total',        description: 'Total sessions in current subscription', example: '12' },
  { key: 'package_name',          label: 'Package name',          description: 'Name of current package',                example: 'Standard Monthly' },
  { key: 'subscription_end_date', label: 'Subscription end date', description: 'Current subscription end date (YYYY-MM-DD)', example: '2026-06-30' },

  // Next session
  { key: 'next_session_date', label: 'Next session date', description: 'Date of next scheduled session', example: '2026-05-15' },
  { key: 'next_session_time', label: 'Next session time', description: 'Time of next scheduled session', example: '18:00' },
];

export const VARIABLE_KEYS: Set<string> = new Set(VARIABLES.map((v) => v.key));
