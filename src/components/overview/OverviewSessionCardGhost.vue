<template>
  <!-- A free place in the running grid's last row (Figma "12 Übersicht", the Agent Dashboard's
       ghosts): the session card's shape, faint and still. A pulse would read as loading. The grid
       stretches it to the row's height. -->
  <div
    class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 opacity-55"
    aria-hidden="true"
  >
    <div class="flex items-center gap-2">
      <span class="h-5 w-18 rounded-full bg-muted" />
      <span class="ml-auto h-2.5 w-11 rounded-full bg-muted" />
    </div>
    <span class="h-3.5 w-2/3 rounded-full bg-muted" />
    <span class="h-2.5 w-1/2 rounded-full bg-muted" />
    <span class="h-9 w-full rounded-lg bg-muted" />
    <span class="mt-auto h-2.5 w-2/5 rounded-full bg-muted" />
  </div>
</template>
