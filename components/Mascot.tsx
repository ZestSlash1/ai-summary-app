export function Mascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="60" cy="108" rx="30" ry="6" fill="#1A1A18" opacity="0.06" />
      <path
        d="M60 14c26.5 0 42 17.6 42 42.5 0 15-6 27-16.5 34.7C78 96.8 69.5 100 60 100s-18-3.2-25.5-8.8C24 83.5 18 71.5 18 56.5 18 31.6 33.5 14 60 14Z"
        fill="#FFFFFF"
        stroke="#ECEAE4"
        strokeWidth="2"
      />
      <path
        d="M60 14c26.5 0 42 17.6 42 42.5 0 3.6-.3 7-.9 10.2C97 47.6 82 33 60 33S23 47.6 18.9 66.7c-.6-3.2-.9-6.6-.9-10.2C18 31.6 33.5 14 60 14Z"
        fill="#EAF2FE"
        opacity="0.6"
      />
      <circle cx="43" cy="58" r="7" fill="#10B981" />
      <circle cx="77" cy="58" r="7" fill="#10B981" />
      <circle cx="45.5" cy="55.5" r="2" fill="#FFFFFF" />
      <circle cx="79.5" cy="55.5" r="2" fill="#FFFFFF" />
      <path
        d="M48 76c4 4.5 8.6 6.5 12 6.5s8-2 12-6.5"
        stroke="#1A1A18"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M60 4v10"
        stroke="#ECEAE4"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="60" cy="4" r="4" fill="#3B82F6" />
    </svg>
  );
}
