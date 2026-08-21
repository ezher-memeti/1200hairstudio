export const serviceImageContainerClass =
  "relative w-full max-w-[24rem] self-center justify-self-stretch overflow-hidden bg-surface md:max-w-[22rem] md:justify-self-end lg:max-w-[25rem] xl:max-w-[28rem]";

export const serviceImageFrameClass =
  "relative aspect-[5/6] w-full md:aspect-square lg:aspect-[5/6]";

export const serviceImageClass =
  "h-full w-full object-cover object-center";

export const serviceImageOverlayClass =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(13,13,13,0.36)_0%,rgba(13,13,13,0.12)_36%,rgba(13,13,13,0.04)_100%)]";

export const acceptedServiceImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;
