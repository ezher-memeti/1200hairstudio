import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({ className = "", priority = false }: BrandLogoProps) {
  return (
    <span className={`relative block shrink-0 ${className}`}>
      <Image
        src="/brand/logo.png"
        alt="1200 Hairstudio"
        width={1562}
        height={1562}
        priority={priority}
        className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[207%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
      />
    </span>
  );
}
