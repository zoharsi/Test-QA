'use strict';

// Keep the player's existing loading hook, now backed by the shared GLB cache.
// Index zero is reserved for the player and never selected by pedestrians.
async function loadPlayerModel(character) {
  character.setModel(Assets.person(0), true);
}
