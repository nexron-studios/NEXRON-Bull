<!-- The chat's backdrop: only a vignette that darkens the edges while the middle keeps the plain
     background (27.11.2026, Jonas: the dot grid fading towards the composer read as a haze and is
     gone; 26.11.2026: no lighter middle, no brand-blue light from the top). It stays put while
     the messages scroll over it. Its own compositing layer (`will-change`): drawn once, then only
     composited, instead of being painted again under every token in WebKit (Bull on the Mac). -->
<template>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 will-change-transform">
    <div class="absolute inset-0 bg-radial from-transparent from-45% to-vignette" />
  </div>
</template>
