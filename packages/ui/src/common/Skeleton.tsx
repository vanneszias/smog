interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted/50 ${className}`}
      style={style}
    />
  );
}

interface ShimmerSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function ShimmerSkeleton({
  className = "",
  style,
}: ShimmerSkeletonProps) {
  return (
    <div
      className={`shimmer-skeleton relative overflow-hidden rounded-md bg-muted/30 ${className}`}
      style={{
        ...style,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)",
          animation: "shimmer 2s infinite",
        }}
      />
      <style>
        {`
          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(100%);
            }
          }
        `}
      </style>
    </div>
  );
}
