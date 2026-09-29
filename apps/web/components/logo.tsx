import React from "react";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  size?: number;
}

export function Logo({
  className = "h-8 w-8",
  size,
  alt = "Sched Logo",
  ...props
}: LogoProps) {
  return (
    <img
      src="/sched_logo.svg"
      alt={alt}
      width={size}
      height={size}
      className={`object-contain select-none ${className}`}
      {...props}
    />
  );
}
