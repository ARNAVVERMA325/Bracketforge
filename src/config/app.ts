export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_NAME || 'BracketForge',
  tagline: import.meta.env.VITE_APP_TAGLINE || 'Run tournaments. Build your arena.',
  url: import.meta.env.VITE_APP_URL || 'https://bracketforge.app',
  contactEmail: import.meta.env.VITE_APP_CONTACT_EMAIL || 'hello@bracketforge.app',
  upiId: import.meta.env.VITE_APP_UPI_ID || '',
  planFeeINR: 300,
  freeDuringBeta: true,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
} as const;

export type TournamentStatus = 'draft' | 'registration_open' | 'live' | 'finished' | 'cancelled';
export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin';
export type SeedingMethod = 'random' | 'manual' | 'registration_order';
export type TournamentVisibility = 'public' | 'unlisted';
export type PlayerStatus = 'pending' | 'approved' | 'rejected' | 'checked_in';
export type MatchStatus = 'pending' | 'in_progress' | 'completed';
export type PaymentStatus = 'unpaid' | 'paid' | 'free';
export type PaymentMode = 'manual' | 'razorpay' | 'cashfree' | 'phonepe';

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Draft',
  registration_open: 'Registration Open',
  live: 'Live',
  finished: 'Finished',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<TournamentStatus, string> = {
  draft: 'bg-gray-700 text-gray-300',
  registration_open: 'bg-blue-600/20 text-blue-400 border border-blue-600/40',
  live: 'bg-red-600/20 text-red-400 border border-red-600/40',
  finished: 'bg-green-600/20 text-green-400 border border-green-600/40',
  cancelled: 'bg-gray-700 text-gray-400',
};

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elimination: 'Single Elimination',
  double_elimination: 'Double Elimination',
  round_robin: 'Round Robin',
};

export const FORMAT_SHORT: Record<TournamentFormat, string> = {
  single_elimination: 'SE',
  double_elimination: 'DE',
  round_robin: 'RR',
};

export const SEEDING_LABELS: Record<SeedingMethod, string> = {
  random: 'Random',
  manual: 'Manual (Drag & Drop)',
  registration_order: 'Registration Order',
};

export const VISIBILITY_LABELS: Record<TournamentVisibility, string> = {
  public: 'Public',
  unlisted: 'Unlisted',
};

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked In',
};

export const PLAYER_STATUS_COLORS: Record<PlayerStatus, string> = {
  pending: 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40',
  approved: 'bg-blue-600/20 text-blue-400 border border-blue-600/40',
  rejected: 'bg-red-600/20 text-red-400 border border-red-600/40',
  checked_in: 'bg-green-600/20 text-green-400 border border-green-600/40',
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  free: 'Free (Beta)',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40',
  paid: 'bg-green-600/20 text-green-400 border border-green-600/40',
  free: 'bg-blue-600/20 text-blue-400 border border-blue-600/40',
};
