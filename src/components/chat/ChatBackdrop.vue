<!-- The chat's backdrop (Figma "Fassung 12 · Chat-Hintergrund"): a fine dot grid that fades out
     towards the composer, and the brand colour falling in softly from the top, like the glow on the
     cards. It stays put while the messages scroll over it. Its own compositing layer
     (`will-change`): drawn once, then only composited. In the chat's layer every token and every
     spinner frame painted the masked dot grid beneath it again, which WebKit (Bull on the Mac)
     paid for heavily. -->
<template>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 will-change-transform">
    <div
      class="absolute inset-0 bg-[radial-gradient(circle,var(--foreground)_0.8px,transparent_1px)] mask-b-from-25% mask-b-to-85% bg-size-[20px_20px] opacity-16"
    />
    <div
      class="absolute inset-0 bg-radial-[83%_55%_at_50%_0%] from-brand/12 to-transparent to-85%"
    />
  </div>
</template>
