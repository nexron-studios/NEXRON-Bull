<!-- The chat's backdrop: one flat colour (`backdrop`, pure black on dark: Jonas, 27.11.2026, the chat
     completely black) with a wide inner shadow along the edges on light, no gradient across the
     area (27.11.2026, Jonas: the radial vignette still read as a light gradient around the empty
     chat's frame; the dot grid fading towards the composer read as a haze; 26.11.2026: no lighter
     middle, no brand-blue light from the top). It stays put while the messages scroll over it. Its
     own compositing layer (`will-change`): drawn once, then only composited, instead of being
     painted again under every token in WebKit (Bull on the Mac). -->
<template>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-backdrop will-change-transform"
  >
    <div class="absolute inset-0 shadow-[inset_0_0_220px_40px_var(--vignette)]" />
  </div>
</template>
