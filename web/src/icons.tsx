type P = { className?: string };
const base = "h-4 w-4 stroke-current fill-none";

export const IconPulse = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} strokeWidth="1.5">
    <path d="M3 12h4l2-6 4 12 2-6h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCoin = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} strokeWidth="1.5">
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </svg>
);

export const IconAlert = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} strokeWidth="1.5">
    <path d="M12 3 2 21h20L12 3z" strokeLinejoin="round" />
    <path d="M12 10v5M12 18h.01" strokeLinecap="round" />
  </svg>
);

export const IconChart = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} strokeWidth="1.5">
    <path d="M3 21h18" strokeLinecap="round" />
    <rect x="5" y="11" width="3" height="8" />
    <rect x="11" y="6" width="3" height="13" />
    <rect x="17" y="14" width="3" height="5" />
  </svg>
);

export const IconDoc = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} strokeWidth="1.5">
    <path d="M6 3h9l4 4v14H6z" strokeLinejoin="round" />
    <path d="M14 3v5h5M9 13h7M9 17h7" strokeLinecap="round" />
  </svg>
);
