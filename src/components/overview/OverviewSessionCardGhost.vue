<template>
  <!-- A free place in the running grid's last row (the Agent Dashboard's ghosts): the session
       card's shape, faint and still. A pulse would read as loading. Every line has the height of
       the card's line in the same place, so the ghost never makes the row taller than its cards;
       the grid stretches it to the row's height. -->
  <div
    class="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 opacity-50"
    aria-hidden="true"
  >
    <div class="flex h-6 items-center gap-3">
      <span class="h-3.5 w-36 rounded-full bg-muted" />
      <span class="ml-auto h-6 w-20 rounded-full bg-muted" />
    </div>
    <div class="mt-4 flex h-6 items-center"><span class="h-4 w-3/4 rounded-full bg-muted" /></div>
    <div class="mt-1 flex h-5 items-center"><span class="h-3 w-1/3 rounded-full bg-muted" /></div>
    <div class="mt-2 flex h-5 items-center">
      <span class="h-1.5 w-full rounded-full bg-muted" />
    </div>
    <div class="mt-1 h-5" />
    <div class="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
      <div class="flex h-10 flex-col justify-center gap-2">
        <span class="h-3 w-full rounded-full bg-muted" />
        <span class="h-3 w-2/3 rounded-full bg-muted" />
      </div>
      <div class="flex h-5 items-center"><span class="h-3 w-1/2 rounded-full bg-muted" /></div>
    </div>
    <div class="mt-auto flex items-center gap-2 pt-5">
      <span class="h-8 w-24 rounded-lg bg-muted" />
      <span class="ml-auto size-8 rounded-lg bg-muted" />
      <span class="h-8 w-28 rounded-lg bg-muted" />
    </div>
  </div>
</template>
