export const MSG = {
  WELCOME:     'welcome',
  PEER_JOINED: 'peer_joined',
  PEER_LEFT:   'peer_left',
  STATE:       'state',
  CHAT:        'chat',
};

export function makeStateMsg(id, player, voted = false) {
  return {
    type: MSG.STATE,
    id,
    pos:   [player.position.x, player.position.y, player.position.z],
    rot:   [player.controls.pitch, player.controls.yaw],
    crouch: !!player.crouching,
    fl:     !!player.flashlight?.on,
    elev:   !!player._inElevator,
    voted:  !!voted,
    san:    Math.round(player.sanity.value),
    t:      performance.now(),
  };
}
