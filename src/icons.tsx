import type { ReactNode } from "react";

type IconProps = {
  readonly className?: string;
};

type IconWrapperProps = IconProps & {
  readonly children: ReactNode;
};

function Icon({ children, className }: IconWrapperProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function MicIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect height="13" rx="3" width="6" x="9" y="2" />
    </Icon>
  );
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  );
}

export function StopIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect height="18" rx="2" width="18" x="3" y="3" />
    </Icon>
  );
}
