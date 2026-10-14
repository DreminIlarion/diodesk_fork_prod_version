import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function ActionButton({
  children,
  className = '',
  ...props
}: ActionButtonProps) {
  return (
    <button
      {...props}
      className={`btn-action ${className}`}
    >
      <span
        className="btn-action__trace"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 300 56"
          preserveAspectRatio="none"
        >
          <rect
            x="1"
            y="1"
            width="298"
            height="54"
            rx="12"
            ry="12"
            pathLength="100"
          />
        </svg>
      </span>

      <span className="btn-action__content">
        {children}
      </span>
    </button>
  );
}