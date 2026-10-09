import { onBeforeUnmount, ref } from 'vue'

// A clock that ticks once a second while the component is mounted.
export function useNow() {
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), 1000)
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
