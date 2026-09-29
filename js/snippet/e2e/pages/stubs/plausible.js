// Plausible's loader stub, as sites paste it: calls queue in plausible.q.
window.plausible =
  window.plausible ||
  function plausible() {
    // biome-ignore lint/suspicious/noAssignInExpressions: mirrors Plausible's own queue stub
    // biome-ignore lint/complexity/noArguments: mirrors Plausible's own queue stub
    (window.plausible.q = window.plausible.q || []).push(Array.from(arguments));
  };
