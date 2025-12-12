type LogoProps = {
  variant?: "default" | "white" | "black";
  width?: number;
  height?: number;
  className?: string;
};

export default function Logo({
  variant = "default",
  width = 240,
  height = 80,
  className = "",
}: LogoProps) {
  const logoSrc =
    variant === "default" ? "/assets/logo.svg" : "/assets/logo-flexible.svg";

  const colorFilter =
    variant === "white"
      ? "brightness(0) invert(1)"
      : variant === "black"
        ? "brightness(0)"
        : "none";

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        alt="SMOG Logo"
        height={height}
        src={logoSrc}
        style={{ filter: colorFilter }}
        width={width}
      />
    </div>
  );
}
