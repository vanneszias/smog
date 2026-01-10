declare module "*.svg" {
  import type { SVGProps } from "react";
  const content: React.FC<SVGProps<SVGSVGElement>>;
  export default content;
}
