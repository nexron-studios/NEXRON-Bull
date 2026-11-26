<!-- The chat's backdrop: a fine dot grid that fades out towards the composer, and a vignette that
     darkens the edges while the middle keeps the plain background (26.11.2026, Jonas: Figma
     "Fassung 14 · Vignette" with the dots, but no lighter middle; the brand-blue light from the
     top is gone). It stays put while the messages scroll over it. -->
<template>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
    <div
      class="absolute inset-0 bg-[radial-gradient(circle,var(--foreground)_0.8px,transparent_1px)] mask-b-from-25% mask-b-to-85% bg-size-[20px_20px] opacity-16"
    />
    <div class="absolute inset-0 bg-radial from-transparent from-45% to-vignette" />
  </div>
</template>
