export function ZoomLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="10" fill="#2D8CFF" />
      <path
        d="M11 18C11 16.3431 12.3431 15 14 15H27C28.6569 15 30 16.3431 30 18V30C30 31.6569 28.6569 33 27 33H14C12.3431 33 11 31.6569 11 30V18Z"
        fill="white"
      />
      <path
        d="M32 20.2679L36.2679 17.067C37.0016 16.5167 38 17.0396 38 17.9542V30.0458C38 30.9604 37.0016 31.4833 36.2679 30.933L32 27.7321V20.2679Z"
        fill="white"
      />
    </svg>
  );
}
