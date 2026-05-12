<template>
  <div class="flex h-screen overflow-hidden bg-surface">
    <!-- Sidebar -->
    <aside class="w-14 flex flex-col items-center py-4 gap-4 bg-panel border-r border-border shrink-0">
      <router-link to="/" class="nav-icon" title="Projects">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      </router-link>
      <router-link to="/settings" class="nav-icon mt-auto" title="Settings">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </router-link>
    </aside>
    <!-- Main -->
    <main class="flex-1 overflow-hidden">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.nav-icon {
  @apply w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors;
}
.router-link-active.nav-icon {
  @apply text-accent bg-accent/10;
}
</style>
