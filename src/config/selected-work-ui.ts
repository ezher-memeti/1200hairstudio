export const selectedWorkImageContainerClass =
  "relative w-full max-w-[20rem] self-center overflow-hidden bg-surface sm:max-w-[22rem] lg:max-w-[26.25rem]";

export const selectedWorkImageFrameClass =
  "relative aspect-[4/5] w-full";

export const selectedWorkImageClass =
  "h-full w-full object-cover object-center";

export const selectedWorkImageOverlayClass =
  "pointer-events-none absolute inset-0 bg-black/10";

export const acceptedSelectedWorkImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const maxSelectedWorkImageBytes = 8 * 1024 * 1024;
